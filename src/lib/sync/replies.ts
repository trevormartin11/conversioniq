/** Sync Instantly unibox replies into the hub DB (classify + draft + auto-handle). */
import { listAllEmails, replyToEmail } from "@/lib/integrations/instantly";
import { chunkedUpsert, supabaseAdmin } from "@/lib/data/supabase";
import { classifyReply } from "@/lib/ai/classify";
import { sendTelegram } from "@/lib/integrations/telegram";
import { loadAutomationLevel } from "@/lib/data/live";
import { decideReply, inboxAutoSendGate, type InboxSendState } from "@/lib/replies/decide";
import { integrations } from "@/lib/config";
import { stripHtml } from "@/lib/utils";
import type { ReplyClass } from "@/lib/data/types";

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").toLowerCase();

function bodyText(body: unknown): string {
  if (!body) return "";
  if (typeof body === "string") return stripHtml(body);
  const b = body as { html?: string; text?: string };
  if (b.text) return b.text.trim();
  if (b.html) return stripHtml(b.html);
  return "";
}

interface LeadLite { id: string; first_name?: string; company?: string; vertical?: string; title?: string }

export async function syncReplies(limit = 1000) {
  const emails = await listAllEmails(limit);
  // Inbound replies only: from someone other than our own sending inbox.
  const replies = emails.filter(
    (e) => e.from_address_email && e.eaccount && e.from_address_email.toLowerCase() !== e.eaccount.toLowerCase(),
  );
  if (replies.length === 0) return { replies: 0, new: 0, hotPings: 0 };

  const db = supabaseAdmin();
  const [{ data: existingReplies }, { data: leadRows }, { data: supRows }, { data: campRows }, { data: inboxRows }] = await Promise.all([
    db.from("replies").select("id"),
    db.from("leads").select("id,email,first_name,company,vertical,title"),
    db.from("suppression").select("email"),
    db.from("campaigns").select("id"),
    db.from("inboxes").select("id,status,daily_cap,sent_today"),
  ]);

  const existing = new Set((existingReplies ?? []).map((r: { id: string }) => r.id));
  const campIds = new Set((campRows ?? []).map((r: { id: string }) => r.id));
  const inboxState = new Map<string, InboxSendState>();
  for (const r of (inboxRows ?? []) as { id: string; status?: string; daily_cap?: number; sent_today?: number }[]) {
    inboxState.set(r.id, { status: r.status ?? "", sentToday: Number(r.sent_today ?? 0), dailyCap: Number(r.daily_cap ?? 0) });
  }
  const supEmails = new Set((supRows ?? []).map((r: { email: string | null }) => (r.email ?? "").toLowerCase()).filter(Boolean));
  const leadByEmail = new Map<string, LeadLite>();
  for (const l of (leadRows ?? []) as Record<string, string>[]) {
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

    // Auto-handled replies must ACTUALLY send. Only keep "auto_sent" if the send succeeds — otherwise
    // fall back to "pending" so a human handles it. (Previously the row was marked sent but no email
    // ever went out: the prospect got silence while the queue showed it handled.)
    if (status === "auto_sent") {
      const subject = (e.subject ?? "").toLowerCase().startsWith("re:") ? (e.subject ?? "") : `Re: ${e.subject ?? ""}`.trim();
      // Inbox guard: never auto-send through a paused, capped-out, or untracked inbox.
      const inboxId = e.eaccount ? `ib_${slug(e.eaccount)}` : "";
      const state = inboxState.get(inboxId);
      const gate = inboxAutoSendGate(state ? { ...state, sentToday: state.sentToday + (sentThisRun.get(inboxId) ?? 0) } : state);
      if (!gate.ok) {
        status = "pending"; // inbox can't carry the send — route to the human queue instead
      } else if (integrations.instantly && e.eaccount && aiDraft?.trim()) {
        try {
          await replyToEmail({ replyToUuid: e.id, eaccount: e.eaccount, subject, bodyText: aiDraft });
          autoSent++;
          sentThisRun.set(inboxId, (sentThisRun.get(inboxId) ?? 0) + 1);
        } catch {
          status = "pending"; // send failed — don't claim it was sent
        }
      } else {
        status = "pending"; // no live sender / no draft — never report sent without sending
      }
    }

    const handled = status !== "pending";
    const now = new Date().toISOString();
    rows.push({
      id, lead_id: lead?.id ?? null,
      campaign_id: e.campaign_id && campIds.has(`c_${e.campaign_id}`) ? `c_${e.campaign_id}` : null,
      inbox_id: e.eaccount && inboxState.has(`ib_${slug(e.eaccount)}`) ? `ib_${slug(e.eaccount)}` : null,
      instantly_email_id: e.id,
      from_email: from, from_name: fromName, subject: e.subject ?? "", body: text,
      received_at: e.timestamp_email ?? now, classification: cls, confidence,
      ai_draft: aiDraft, draft_source: draftSource, status, hot,
      handled_by: handled ? "system" : null, handled_at: handled ? now : null,
    });

    if (suppress && !supEmails.has(from)) {
      supEmails.add(from);
      suppressions.push({
        id: `sup_${e.id}`, email: from, domain: null,
        reason: cls === "unsubscribe" ? "unsubscribed" : "dnc",
        source: `reply:${id}`, lead_id: lead?.id ?? null, note: "Auto-suppressed from reply", created_at: now,
      });
    }
    if (hot && status === "pending") {
      void sendTelegram(`🔥 *${cls}* reply from ${fromName}\n${text.slice(0, 200)}`);
      hotPings++;
    }
  }

  const written = rows.length ? await chunkedUpsert("replies", rows) : 0;
  if (suppressions.length) await chunkedUpsert("suppression", suppressions);
  return { replies: replies.length, new: written, hotPings, autoSent };
}
