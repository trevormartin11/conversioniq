/**
 * Live data loader — reads the hub DB (Supabase) into the in-memory Dataset
 * shape the app already uses, so selectors/getters stay unchanged. Called by
 * store.ensureData() in live mode (request-cached).
 */
import { supabaseAdmin } from "./supabase";
import { appConfig } from "@/lib/config";
import type {
  AutomationLevel,
  Dataset,
  Health,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (v == null ? "" : String(v));
const sn = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const bool = (v: unknown): boolean => v === true || v === "true";

async function fetchAll(table: string): Promise<Row[]> {
  const { data, error } = await supabaseAdmin().from(table).select("*").limit(5000);
  if (error) {
    // Stay resilient to a not-yet-applied migration (e.g. `costs` before 0002):
    // a missing/unavailable table just reads as empty rather than crashing the app.
    if (process.env.NODE_ENV !== "production") console.warn(`[live] ${table}: ${error.message}`);
    return [];
  }
  return (data as Row[]) ?? [];
}

export async function loadDatasetLive(): Promise<Dataset> {
  const [
    users, personas, domains, inboxes, campaigns, leads, replies, suppression,
    creditMeters, creditRequests, audit, jobs, demos, variants, metrics, costs,
  ] = await Promise.all([
    fetchAll("users"), fetchAll("personas"), fetchAll("domains"), fetchAll("inboxes"),
    fetchAll("campaigns"), fetchAll("leads"), fetchAll("replies"), fetchAll("suppression"),
    fetchAll("credit_meters"), fetchAll("credit_requests"), fetchAll("audit_log"),
    fetchAll("job_runs"), fetchAll("demos"), fetchAll("sequence_variants"),
    fetchAll("daily_metrics"), fetchAll("costs"),
  ]);

  return {
    users: users.map((r) => ({ id: s(r.id), name: s(r.name), email: s(r.email), role: (s(r.role) || "partner") as "owner" | "partner", avatarColor: s(r.avatar_color) || "#6366f1" })),
    personas: personas.map((r) => ({ id: s(r.id), name: s(r.name), fromName: s(r.from_name), title: s(r.title), signature: s(r.signature) })),
    domains: domains.map((r) => ({ id: s(r.id), domain: s(r.domain), personaId: s(r.persona_id), spf: bool(r.spf), dkim: bool(r.dkim), dmarc: bool(r.dmarc), reputation: (s(r.reputation) || "green") as Health })),
    inboxes: inboxes.map((r) => ({ id: s(r.id), email: s(r.email), domainId: s(r.domain_id), personaId: s(r.persona_id), instantlyAccountId: sn(r.instantly_account_id), warmupScore: num(r.warmup_score), status: (s(r.status) || "warming") as Dataset["inboxes"][number]["status"], dailyCap: num(r.daily_cap), sentToday: num(r.sent_today), bounceRate: num(r.bounce_rate), spamComplaints: num(r.spam_complaints), lastSyncedAt: sn(r.last_synced_at) })),
    campaigns: campaigns.map((r) => ({ id: s(r.id), name: s(r.name), vertical: s(r.vertical), personaId: s(r.persona_id), status: (s(r.status) || "draft") as Dataset["campaigns"][number]["status"], instantlyCampaignId: sn(r.instantly_campaign_id), listVersion: s(r.list_version), inboxIds: (r.inbox_ids as string[]) ?? [], dailyCap: num(r.daily_cap), createdAt: s(r.created_at) })),
    leads: leads.map((r) => ({ id: s(r.id), email: s(r.email), domain: s(r.domain), firstName: s(r.first_name), lastName: s(r.last_name), company: s(r.company), title: s(r.title), phone: sn(r.phone), campaignId: sn(r.campaign_id), vertical: s(r.vertical), persona: s(r.persona), sendingDomain: s(r.sending_domain), listVersion: s(r.list_version), source: s(r.source), attributionOwner: s(r.attribution_owner), status: (s(r.status) || "new") as Dataset["leads"][number]["status"], zohoLeadId: sn(r.zoho_lead_id), apolloId: sn(r.apollo_id), createdAt: s(r.created_at), lastContactedAt: sn(r.last_contacted_at) })),
    replies: replies.map((r) => ({ id: s(r.id), leadId: s(r.lead_id), campaignId: sn(r.campaign_id), inboxId: s(r.inbox_id), instantlyEmailId: sn(r.instantly_email_id), fromEmail: s(r.from_email), fromName: s(r.from_name), subject: s(r.subject), body: s(r.body), receivedAt: s(r.received_at), classification: (s(r.classification) || "question") as Dataset["replies"][number]["classification"], confidence: num(r.confidence), aiDraft: sn(r.ai_draft), draftSource: (r.draft_source ? s(r.draft_source) : null) as Dataset["replies"][number]["draftSource"], status: (s(r.status) || "pending") as Dataset["replies"][number]["status"], hot: bool(r.hot), handledBy: sn(r.handled_by), handledAt: sn(r.handled_at) })),
    suppression: suppression.map((r) => ({ id: s(r.id), email: sn(r.email), domain: sn(r.domain), reason: (s(r.reason) || "manual") as Dataset["suppression"][number]["reason"], source: s(r.source), leadId: sn(r.lead_id), createdAt: s(r.created_at), note: sn(r.note) })),
    creditMeters: creditMeters.map((r) => ({ provider: s(r.provider) as Dataset["creditMeters"][number]["provider"], label: s(r.label), used: num(r.used), total: num(r.total), resetsAt: sn(r.resets_at), gated: bool(r.gated), lastSyncedAt: sn(r.last_synced_at) })),
    creditRequests: creditRequests.map((r) => ({ id: s(r.id), provider: s(r.provider) as Dataset["creditRequests"][number]["provider"], amount: num(r.amount), reason: s(r.reason), requestedBy: s(r.requested_by), status: (s(r.status) || "pending") as Dataset["creditRequests"][number]["status"], decidedBy: sn(r.decided_by), createdAt: s(r.created_at), decidedAt: sn(r.decided_at) })),
    audit: audit.map((r) => ({ id: s(r.id), actor: s(r.actor), action: s(r.action), entity: s(r.entity), entityId: sn(r.entity_id), meta: (r.meta as Record<string, unknown>) ?? {}, createdAt: s(r.created_at) })),
    jobs: jobs.map((r) => ({ id: s(r.id), job: s(r.job), status: (s(r.status) || "ok") as Dataset["jobs"][number]["status"], lastRunAt: sn(r.last_run_at), nextRunAt: sn(r.next_run_at), durationMs: r.duration_ms == null ? null : num(r.duration_ms), error: sn(r.error) })),
    demos: demos.map((r) => ({ id: s(r.id), leadId: s(r.lead_id), scheduledAt: s(r.scheduled_at), status: (s(r.status) || "booked") as Dataset["demos"][number]["status"], owner: s(r.owner), mrr: r.mrr == null ? null : num(r.mrr), outcomeReason: sn(r.outcome_reason) as Dataset["demos"][number]["outcomeReason"], outcomeNote: sn(r.outcome_note), outcomeAt: sn(r.outcome_at), civDealId: sn(r.civ_deal_id), reminderSentAt: sn(r.reminder_sent_at) })),
    variants: variants.map((r) => ({ id: s(r.id), campaignId: s(r.campaign_id), step: num(r.step), variant: s(r.variant), subject: s(r.subject), body: s(r.body), sent: num(r.sent), opens: num(r.opens), replies: num(r.replies), positives: num(r.positives), approved: bool(r.approved) })),
    metrics: metrics.map((r) => ({ date: s(r.date), campaignId: sn(r.campaign_id), sends: num(r.sends), opens: num(r.opens), replies: num(r.replies), positives: num(r.positives), bounces: num(r.bounces), demos: num(r.demos) })),
    costs: costs.map((r) => ({ id: s(r.id), category: s(r.category) as Dataset["costs"][number]["category"], vendor: s(r.vendor), description: s(r.description), amount: num(r.amount), cadence: (s(r.cadence) || "monthly") as Dataset["costs"][number]["cadence"], status: (s(r.status) || "active") as "active" | "cancelled", startedAt: s(r.started_at), nextChargeAt: sn(r.next_charge_at), source: (s(r.source) || "manual") as "manual" | "auto", note: sn(r.note), createdBy: s(r.created_by) })),
    alerts: [],
  };
}

export async function loadAutomationLevel(): Promise<AutomationLevel> {
  const { data } = await supabaseAdmin().from("settings").select("value").eq("key", "automation_level").maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  const lvl = typeof v === "string" ? v.replace(/"/g, "") : "approve_all";
  return (["approve_all", "auto_safe", "auto_all"].includes(lvl) ? lvl : "approve_all") as AutomationLevel;
}

export async function loadAssumptions(): Promise<{ closeRate: number; monthlyMrr: number }> {
  const def = { closeRate: appConfig.projection.assumedCloseRate, monthlyMrr: appConfig.projection.assumedMonthlyMrr };
  try {
    const { data } = await supabaseAdmin()
      .from("settings")
      .select("key,value")
      .in("key", ["assumed_close_rate", "assumed_monthly_mrr"]);
    const rows = (data as { key: string; value: unknown }[] | null) ?? [];
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    const toNum = (v: unknown, d: number) => {
      const n = Number(typeof v === "string" ? v.replace(/"/g, "") : v);
      return Number.isFinite(n) ? n : d;
    };
    return { closeRate: toNum(get("assumed_close_rate"), def.closeRate), monthlyMrr: toNum(get("assumed_monthly_mrr"), def.monthlyMrr) };
  } catch {
    return def;
  }
}
