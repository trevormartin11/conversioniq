/** Sync Instantly unibox replies into the hub DB (classify + draft + auto-handle). */
import { listAllEmails } from "@/lib/integrations/instantly";
import { chunkedUpsert, supabaseAdmin } from "@/lib/data/supabase";
import { classifyReply } from "@/lib/ai/classify";
import { draftReply } from "@/lib/ai/draft";
import { sendTelegram } from "@/lib/integrations/telegram";
import { loadAutomationLevel } from "@/lib/data/live";
import { appConfig } from "@/lib/config";
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

export async function syncReplies() {
  const emails = await listAllEmails(1000);
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
    db.from("inboxes").select("id"),
  ]);

  const existing = new Set((existingReplies ?? []).map((r: { id: string }) => r.id));
  const campIds = new Set((campRows ?? []).map((r: { id: string }) => r.id));
  const inboxIds = new Set((inboxRows ?? []).map((r: { id: string }) => r.id));
  const supEmails = new Set((supRows ?? []).map((r: { email: string | null }) => (r.email ?? "").toLowerCase()).filter(Boolean));
  const leadByEmail = new Map<string, LeadLite>();
  for (const l of (leadRows ?? []) as Record<string, string>[]) {
    leadByEmail.set((l.email ?? "").toLowerCase(), { id: l.id, first_name: l.first_name, company: l.company, vertical: l.vertical, title: l.title });
  }

  const level = await loadAutomationLevel();
  const rows: Record<string, unknown>[] = [];
  const suppressions: Record<string, unknown>[] = [];
  let hotPings = 0;

  for (const e of replies) {
    const id = `i_${e.id}`;
    if (existing.has(id)) continue;
    const from = (e.from_address_email ?? "").toLowerCase();
    const text = bodyText(e.body);
    const { classification, confidence } = await classifyReply(text);
    const cls = classification as ReplyClass;
    const lead = leadByEmail.get(from);
    const fromName = (lead?.first_name ?? "").trim() || from;

    const suppress = cls === "unsubscribe" || cls === "negative";
    const isOoo = cls === "ooo";
    const autoSafe = (appConfig.autoSafeClasses as readonly string[]).includes(cls);
    const confident = confidence >= 0.85;

    let aiDraft: string | null = null;
    let draftSource: string | null = null;
    if (!suppress && !isOoo) {
      const d = await draftReply(
        { classification: cls, body: text, fromName },
        lead ? { firstName: lead.first_name, company: lead.company, vertical: lead.vertical, title: lead.title } : null,
      );
      aiDraft = d.draft;
      draftSource = d.source;
    }

    let status = "pending";
    if (suppress) status = "suppressed";
    else if (isOoo) status = "snoozed";
    else if ((level === "auto_all" || (level === "auto_safe" && autoSafe)) && confident && (aiDraft?.trim()?.length ?? 0) > 0) {
      // Only auto-send when confident AND we actually have a non-empty draft.
      status = "auto_sent";
    }

    const hot = appConfig.hotClasses.includes(cls as (typeof appConfig.hotClasses)[number]);
    const handled = status !== "pending";
    const now = new Date().toISOString();
    rows.push({
      id, lead_id: lead?.id ?? null,
      campaign_id: e.campaign_id && campIds.has(`c_${e.campaign_id}`) ? `c_${e.campaign_id}` : null,
      inbox_id: e.eaccount && inboxIds.has(`ib_${slug(e.eaccount)}`) ? `ib_${slug(e.eaccount)}` : null,
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
  return { replies: replies.length, new: written, hotPings };
}
