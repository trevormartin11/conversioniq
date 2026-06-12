/** Sync Instantly unibox replies into the hub DB (classify + draft + auto-handle). */
import { listAllEmails, replyToEmail } from "@/lib/integrations/instantly";
import { chunkedUpsert, supabaseAdmin } from "@/lib/data/supabase";
import { classifyReply } from "@/lib/ai/classify";
import { sendTelegram, tgEscape } from "@/lib/integrations/telegram";
import { loadAutomationLevel } from "@/lib/data/live";
import { decideReply, inboxAutoSendGate, type InboxSendState } from "@/lib/replies/decide";
import { integrations } from "@/lib/config";
import { stripHtml } from "@/lib/utils";
import type { ReplyClass } from "@/lib/data/types";

export function bodyText(body: unknown): string {
  if (!body) return "";
  if (typeof body === "string") return stripHtml(body);
  // Sub-fields must be string-guarded too: a hand-crafted {"text": ["x"]} payload threw a
  // TypeError past the webhook's preview branch.
  const b = body as { html?: unknown; text?: unknown };
  if (typeof b.text === "string" && b.text) return b.text.trim();
  if (typeof b.html === "string" && b.html) return stripHtml(b.html);
  return "";
}

interface LeadLite { id: string; first_name?: string; company?: string; vertical?: string; title?: string }

/**
 * Read every row of (table, cols), paginated past PostgREST's 1,000-row cap, FAIL-CLOSED.
 * The dedupe set is what stops this sync from re-answering every reply in the unibox: an
 * unchecked/truncated read here silently re-fired historical auto-sends. Any error throws.
 */
async function selectAll(table: string, cols: string, orderCol: string): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  const all: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin().from(table).select(cols).order(orderCol, { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`syncReplies: ${table} read failed: ${error.message}`);
    const rows = (data as unknown as Record<string, unknown>[]) ?? [];
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

export async function syncReplies(limit = 1000) {
  const emails = await listAllEmails(limit);
  // Inbound replies only: from someone other than our own sending inbox.
  const replies = emails.filter(
    (e) => e.from_address_email && e.eaccount && e.from_address_email.toLowerCase() !== e.eaccount.toLowerCase(),
  );
  if (replies.length === 0) return { replies: 0, new: 0, hotPings: 0 };

  const db = supabaseAdmin();
  const [existingReplies, leadRows, supRows, campRows, inboxRows] = await Promise.all([
    selectAll("replies", "id", "id"),
    selectAll("leads", "id,email,first_name,company,vertical,title", "id"),
    selectAll("suppression", "id,email", "id"),
    selectAll("campaigns", "id", "id"),
    selectAll("inboxes", "id,email,status,daily_cap,sent_today", "id"),
  ]);

  const existing = new Set(existingReplies.map((r) => String(r.id)));
  const campIds = new Set(campRows.map((r) => String(r.id)));
  // Keyed by EMAIL (the natural key) — deriving `ib_${slug(eaccount)}` re-implemented the
  // inbox-id scheme here and broke (fail-closed, but still broke) the moment ids diverged.
  const inboxState = new Map<string, InboxSendState & { id: string }>();
  for (const r of inboxRows as { id: string; email?: string; status?: string; daily_cap?: number; sent_today?: number }[]) {
    if (!r.email) continue;
    inboxState.set(r.email.toLowerCase(), { id: r.id, status: r.status ?? "", sentToday: Number(r.sent_today ?? 0), dailyCap: Number(r.daily_cap ?? 0) });
  }
  const supEmails = new Set(supRows.map((r) => String(r.email ?? "").toLowerCase()).filter(Boolean));
  const leadByEmail = new Map<string, LeadLite>();
  for (const l of leadRows as Record<string, string>[]) {
    leadByEmail.set((l.email ?? "").toLowerCase(), { id: l.id, first_name: l.first_name, company: l.company, vertical: l.vertical, title: l.title });
  }

  const level = await loadAutomationLevel();
  const rows: Record<string, unknown>[] = [];
  const suppressions: Record<string, unknown>[] = [];
  let hotPings = 0;
  let autoSent = 0;
  // Auto-sends made during THIS run, per inbox — counted against the daily cap so a burst of
  // replies in one sync can't blow past it (the DB's sent_today only refreshes on inbox sync).
  const sentThisRun = new Map<string, number>();

  for (const e of replies) {
    const id = `i_${e.id}`;
    if (existing.has(id)) continue;
    const from = (e.from_address_email ?? "").toLowerCase();
    const text = bodyText(e.body);
    const { classification, confidence } = await classifyReply(text);
    const cls = classification as ReplyClass;
    const lead = leadByEmail.get(from);
    const fromName = (lead?.first_name ?? "").trim() || from;

    const decision = await decideReply({
      classification: cls,
      confidence,
      text,
      fromName,
      lead: lead ? { firstName: lead.first_name, company: lead.company, vertical: lead.vertical, title: lead.title } : null,
      level,
    });
    const { aiDraft, draftSource, suppress, hot } = decision;
    let status = decision.status;

    const now = new Date().toISOString();
    const baseRow = {
      id, lead_id: lead?.id ?? null,
      campaign_id: e.campaign_id && campIds.has(`c_${e.campaign_id}`) ? `c_${e.campaign_id}` : null,
      inbox_id: e.eaccount ? inboxState.get(e.eaccount.toLowerCase())?.id ?? null : null,
      instantly_email_id: e.id,
      from_email: from, from_name: fromName, subject: e.subject ?? "", body: text,
      received_at: e.timestamp_email ?? now, classification: cls, confidence,
      ai_draft: aiDraft, draft_source: draftSource, hot,
    };

    // Auto-handled replies must ACTUALLY send, exactly once. The row is persisted as a CLAIM
    // (insert-if-absent) BEFORE the send: an overlapping run (webhook ∥ 10-min cron ∥ daily)
    // that loses the insert skips the send entirely, and a crash mid-run can no longer lose
    // already-sent rows — the old code batched all writes at the end, so the next cron found
    // the rows missing and re-emailed the same prospects.
    if (status === "auto_sent") {
      const subject = (e.subject ?? "").toLowerCase().startsWith("re:") ? (e.subject ?? "") : `Re: ${e.subject ?? ""}`.trim();
      // Inbox guard: never auto-send through a paused/errored, capped-out, or untracked inbox.
      const inboxKey = (e.eaccount ?? "").toLowerCase();
      const state = inboxState.get(inboxKey);
      const gate = inboxAutoSendGate(state ? { ...state, sentToday: state.sentToday + (sentThisRun.get(inboxKey) ?? 0) } : state);
      if (!gate.ok) {
        status = "pending"; // inbox can't carry the send — route to the human queue instead
      } else if (integrations.instantly && e.eaccount && aiDraft?.trim()) {
        const claimRow = { ...baseRow, status: "auto_sent", handled_by: "system", handled_at: now };
        const { data: won, error: claimErr } = await db
          .from("replies")
          .upsert(claimRow, { onConflict: "id", ignoreDuplicates: true })
          .select("id");
        if (claimErr) throw new Error(`syncReplies: reply claim failed: ${claimErr.message}`);
        if (!won?.length) continue; // another run already owns this reply — skip, no send
        try {
          await replyToEmail({ replyToUuid: e.id, eaccount: e.eaccount, subject, bodyText: aiDraft });
          autoSent++;
          sentThisRun.set(inboxKey, (sentThisRun.get(inboxKey) ?? 0) + 1);
        } catch {
          // Send failed after the claim — return it to the human queue (best-effort).
          await db.from("replies").update({ status: "pending", handled_by: null, handled_at: null }).eq("id", id);
        }
        continue; // row already persisted by the claim
      } else {
        status = "pending"; // no live sender / no draft — never report sent without sending
      }
    }

    const handled = status !== "pending";
    rows.push({ ...baseRow, status, handled_by: handled ? "system" : null, handled_at: handled ? now : null });

    if (suppress && !supEmails.has(from)) {
      supEmails.add(from);
      suppressions.push({
        id: `sup_${e.id}`, email: from, domain: null,
        reason: cls === "unsubscribe" ? "unsubscribed" : "dnc",
        source: `reply:${id}`, lead_id: lead?.id ?? null, note: "Auto-suppressed from reply", created_at: now,
      });
    }
    if (hot && status === "pending") {
      void sendTelegram(`🔥 *${cls}* reply from ${tgEscape(fromName)}\n${tgEscape(text.slice(0, 200))}`);
      hotPings++;
    }
  }

  const written = rows.length ? await chunkedUpsert("replies", rows) : 0;
  if (suppressions.length) await chunkedUpsert("suppression", suppressions);
  return { replies: replies.length, new: written + autoSent, hotPings, autoSent };
}
