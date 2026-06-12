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

/** PostgREST error code for "relation does not exist" — the only error we tolerate as empty. */
const UNDEFINED_TABLE = "42P01";
const PAGE = 1000; // Supabase's default max-rows clamps any larger limit anyway

/**
 * Read a whole table, paginated past PostgREST's row cap (a single `.limit(5000)` was silently
 * clamped to 1,000 rows — at sending scale that truncated the suppression universe and made the
 * DNC gate miss entries). Fail-closed: only a not-yet-applied migration (undefined table) reads
 * as empty; any other error THROWS so a transient Supabase failure aborts the request instead of
 * hydrating an empty universe that the suppression/consent gates would then wave through.
 */
export async function fetchAll(table: string, orderCols: string[] = ["id"]): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabaseAdmin().from(table).select("*");
    for (const col of orderCols) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) {
      if (error.code === UNDEFINED_TABLE) {
        if (process.env.NODE_ENV !== "production") console.warn(`[live] ${table}: ${error.message}`);
        return [];
      }
      throw new Error(`hydration failed for ${table}: ${error.message}`);
    }
    const rows = (data as Row[]) ?? [];
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

/** Every hydratable Dataset collection, each with its own loader — the unit of selective
 *  hydration. A page declares the collections it reads; only those tables are fetched. */
export const COLLECTION_LOADERS = {
  users: async () => (await fetchAll("users")).map((r) => ({ id: s(r.id), name: s(r.name), email: s(r.email), role: (s(r.role) || "partner") as "owner" | "partner", avatarColor: s(r.avatar_color) || "#6366f1" })),
  personas: async () => (await fetchAll("personas")).map((r) => ({ id: s(r.id), name: s(r.name), fromName: s(r.from_name), title: s(r.title), signature: s(r.signature) })),
  domains: async () => (await fetchAll("domains")).map((r) => ({ id: s(r.id), domain: s(r.domain), personaId: s(r.persona_id), spf: bool(r.spf), dkim: bool(r.dkim), dmarc: bool(r.dmarc), reputation: (s(r.reputation) || "green") as Health })),
  inboxes: async () => (await fetchAll("inboxes")).map((r) => ({ id: s(r.id), email: s(r.email), domainId: s(r.domain_id), personaId: s(r.persona_id), instantlyAccountId: sn(r.instantly_account_id), warmupScore: num(r.warmup_score), status: (s(r.status) || "warming") as Dataset["inboxes"][number]["status"], dailyCap: num(r.daily_cap), sentToday: num(r.sent_today), bounceRate: num(r.bounce_rate), spamComplaints: num(r.spam_complaints), lastSyncedAt: sn(r.last_synced_at) })),
  campaigns: async () => (await fetchAll("campaigns")).map((r) => ({ id: s(r.id), name: s(r.name), vertical: s(r.vertical), personaId: s(r.persona_id), status: (s(r.status) || "draft") as Dataset["campaigns"][number]["status"], instantlyCampaignId: sn(r.instantly_campaign_id), listVersion: s(r.list_version), inboxIds: (r.inbox_ids as string[]) ?? [], dailyCap: num(r.daily_cap), createdAt: s(r.created_at) })),
  leads: async () => (await fetchAll("leads")).map((r) => ({ id: s(r.id), email: s(r.email), domain: s(r.domain), firstName: s(r.first_name), lastName: s(r.last_name), company: s(r.company), title: s(r.title), phone: sn(r.phone), campaignId: sn(r.campaign_id), vertical: s(r.vertical), persona: s(r.persona), sendingDomain: s(r.sending_domain), listVersion: s(r.list_version), source: s(r.source), attributionOwner: s(r.attribution_owner), status: (s(r.status) || "new") as Dataset["leads"][number]["status"], zohoLeadId: sn(r.zoho_lead_id), apolloId: sn(r.apollo_id), createdAt: s(r.created_at), lastContactedAt: sn(r.last_contacted_at) })),
  replies: async () => (await fetchAll("replies")).map((r) => ({ id: s(r.id), leadId: s(r.lead_id), campaignId: sn(r.campaign_id), inboxId: s(r.inbox_id), instantlyEmailId: sn(r.instantly_email_id), fromEmail: s(r.from_email), fromName: s(r.from_name), subject: s(r.subject), body: s(r.body), receivedAt: s(r.received_at), classification: (s(r.classification) || "question") as Dataset["replies"][number]["classification"], confidence: num(r.confidence), aiDraft: sn(r.ai_draft), draftSource: (r.draft_source ? s(r.draft_source) : null) as Dataset["replies"][number]["draftSource"], status: (s(r.status) || "pending") as Dataset["replies"][number]["status"], hot: bool(r.hot), handledBy: sn(r.handled_by), handledAt: sn(r.handled_at) })),
  suppression: async () => (await fetchAll("suppression")).map((r) => ({ id: s(r.id), email: sn(r.email), domain: sn(r.domain), reason: (s(r.reason) || "manual") as Dataset["suppression"][number]["reason"], source: s(r.source), leadId: sn(r.lead_id), createdAt: s(r.created_at), note: sn(r.note) })),
  creditMeters: async () => (await fetchAll("credit_meters", ["provider"])).map((r) => ({ provider: s(r.provider) as Dataset["creditMeters"][number]["provider"], label: s(r.label), used: num(r.used), total: num(r.total), resetsAt: sn(r.resets_at), gated: bool(r.gated), lastSyncedAt: sn(r.last_synced_at) })),
  audit: async () => (await fetchAll("audit_log")).map((r) => ({ id: s(r.id), actor: s(r.actor), action: s(r.action), entity: s(r.entity), entityId: sn(r.entity_id), meta: (r.meta as Record<string, unknown>) ?? {}, createdAt: s(r.created_at) })),
  jobs: async () => (await fetchAll("job_runs")).map((r) => ({ id: s(r.id), job: s(r.job), status: (s(r.status) || "ok") as Dataset["jobs"][number]["status"], lastRunAt: sn(r.last_run_at), nextRunAt: sn(r.next_run_at), durationMs: r.duration_ms == null ? null : num(r.duration_ms), error: sn(r.error) })),
  demos: async () => (await fetchAll("demos")).map((r) => ({ id: s(r.id), leadId: s(r.lead_id), scheduledAt: s(r.scheduled_at), status: (s(r.status) || "booked") as Dataset["demos"][number]["status"], owner: s(r.owner), mrr: r.mrr == null ? null : num(r.mrr), outcomeReason: sn(r.outcome_reason) as Dataset["demos"][number]["outcomeReason"], outcomeNote: sn(r.outcome_note), outcomeAt: sn(r.outcome_at), civDealId: sn(r.civ_deal_id), reminderSentAt: sn(r.reminder_sent_at) })),
  variants: async () => (await fetchAll("sequence_variants")).map((r) => ({ id: s(r.id), campaignId: s(r.campaign_id), step: num(r.step), variant: s(r.variant), subject: s(r.subject), body: s(r.body), sent: num(r.sent), opens: num(r.opens), replies: num(r.replies), positives: num(r.positives), approved: bool(r.approved) })),
  metrics: async () => (await fetchAll("daily_metrics", ["date", "campaign_id"])).map((r) => ({ date: s(r.date), campaignId: sn(r.campaign_id), sends: num(r.sends), opens: num(r.opens), replies: num(r.replies), positives: num(r.positives), bounces: num(r.bounces), demos: num(r.demos) })),
  costs: async () => (await fetchAll("costs")).map((r) => ({ id: s(r.id), category: s(r.category) as Dataset["costs"][number]["category"], vendor: s(r.vendor), description: s(r.description), amount: num(r.amount), cadence: (s(r.cadence) || "monthly") as Dataset["costs"][number]["cadence"], status: (s(r.status) || "active") as "active" | "cancelled", startedAt: s(r.started_at), nextChargeAt: sn(r.next_charge_at), source: (s(r.source) || "manual") as "manual" | "auto", note: sn(r.note), createdBy: s(r.created_by) })),
  consent: async () => (await fetchAll("consent_records")).map((r) => ({ id: s(r.id), leadId: sn(r.lead_id), channel: s(r.channel) as Dataset["consent"][number]["channel"], handle: s(r.handle), status: (s(r.status) || "pending") as Dataset["consent"][number]["status"], source: (s(r.source) || "manual") as Dataset["consent"][number]["source"], proof: sn(r.proof), capturedAt: s(r.captured_at), updatedAt: s(r.updated_at) || s(r.captured_at), note: sn(r.note) })),
  channelAccounts: async () => (await fetchAll("channel_accounts")).map((r) => ({ id: s(r.id), channel: s(r.channel) as Dataset["channelAccounts"][number]["channel"], label: s(r.label), identifier: s(r.identifier), status: (s(r.status) || "pending") as Dataset["channelAccounts"][number]["status"], dailyCap: num(r.daily_cap), sentToday: num(r.sent_today), tenDlc: (s(r.ten_dlc) || "n/a") as Dataset["channelAccounts"][number]["tenDlc"], provider: s(r.provider), note: sn(r.note) })),
  outreach: async () => (await fetchAll("outreach_messages")).map((r) => ({ id: s(r.id), channel: s(r.channel) as Dataset["outreach"][number]["channel"], leadId: sn(r.lead_id), campaignId: sn(r.campaign_id), accountId: sn(r.account_id), toName: s(r.to_name), toHandle: s(r.to_handle), body: s(r.body), status: (s(r.status) || "draft") as Dataset["outreach"][number]["status"], source: (s(r.source) || "manual") as Dataset["outreach"][number]["source"], consentId: sn(r.consent_id), profileUrl: sn(r.profile_url), rationale: sn(r.rationale), createdAt: s(r.created_at), scheduledAt: sn(r.scheduled_at), sentAt: sn(r.sent_at), approvedBy: sn(r.approved_by), sentBy: sn(r.sent_by), note: sn(r.note) })),
  landingPages: async () => (await fetchAll("landing_pages")).map((r) => ({ id: s(r.id), campaignId: sn(r.campaign_id), vertical: s(r.vertical), domain: sn(r.domain), status: (s(r.status) || "draft") as Dataset["landingPages"][number]["status"], content: (r.content ?? {}) as Dataset["landingPages"][number]["content"], schedulerUrl: sn(r.scheduler_url), videoUrl: sn(r.video_url), publishedUrl: sn(r.published_url), source: (s(r.source) || "rules") as "ai" | "rules", createdAt: s(r.created_at), updatedAt: s(r.updated_at) || s(r.created_at), approvedBy: sn(r.approved_by), approvedAt: sn(r.approved_at), publishedAt: sn(r.published_at), note: sn(r.note) })),
} as const;

export type HubCollection = keyof typeof COLLECTION_LOADERS;
export const ALL_COLLECTIONS = Object.keys(COLLECTION_LOADERS) as HubCollection[];

/** Fetch ONLY the requested collections (in parallel). The 22-round-trip / whole-DB-per-request
 *  hydration this replaces moved 3.85–17 MB per page; a typical page needs 2–6 collections. */
export async function loadCollectionsLive(keys: HubCollection[]): Promise<Partial<Dataset>> {
  const uniq = [...new Set(keys)];
  const results = await Promise.all(uniq.map((k) => COLLECTION_LOADERS[k]()));
  const out: Record<string, unknown> = {};
  uniq.forEach((k, i) => (out[k] = results[i]));
  return out as Partial<Dataset>;
}

/** Full hydration — the cron path and any surface without a declaration. */
export async function loadDatasetLive(): Promise<Dataset> {
  const partial = await loadCollectionsLive(ALL_COLLECTIONS);
  return { alerts: [], ...(partial as Omit<Dataset, "alerts">) };
}

export interface HubSettings {
  automationLevel: AutomationLevel;
  assumptions: { closeRate: number; monthlyMrr: number };
  icp: string | null;
}

/** All operator settings in ONE query (the three separate lookups cost 3×RTT per request). */
export async function loadSettings(): Promise<HubSettings> {
  const def: HubSettings = {
    automationLevel: "approve_all",
    assumptions: { closeRate: appConfig.projection.assumedCloseRate, monthlyMrr: appConfig.projection.assumedMonthlyMrr },
    icp: null,
  };
  try {
    const { data, error } = await supabaseAdmin().from("settings").select("key,value");
    if (error) throw new Error(error.message);
    const rows = (data as { key: string; value: unknown }[] | null) ?? [];
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    const str = (v: unknown) => (typeof v === "string" ? v.replace(/^"|"$/g, "") : "");
    const toNum = (v: unknown, d: number) => {
      const n = Number(typeof v === "string" ? v.replace(/"/g, "") : v);
      return Number.isFinite(n) ? n : d;
    };
    const lvl = str(get("automation_level"));
    return {
      automationLevel: (["approve_all", "auto_safe", "auto_all"].includes(lvl) ? lvl : "approve_all") as AutomationLevel,
      assumptions: {
        closeRate: toNum(get("assumed_close_rate"), def.assumptions.closeRate),
        monthlyMrr: toNum(get("assumed_monthly_mrr"), def.assumptions.monthlyMrr),
      },
      icp: str(get("icp_fit")).trim() || null,
    };
  } catch {
    return def;
  }
}


export async function loadAutomationLevel(): Promise<AutomationLevel> {
  const { data } = await supabaseAdmin().from("settings").select("value").eq("key", "automation_level").maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  const lvl = typeof v === "string" ? v.replace(/"/g, "") : "approve_all";
  return (["approve_all", "auto_safe", "auto_all"].includes(lvl) ? lvl : "approve_all") as AutomationLevel;
}

/** The operator-edited ICP ("who we win with"), or null to fall back to the built-in default. */
export async function loadIcp(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin().from("settings").select("value").eq("key", "icp_fit").maybeSingle();
    const v = (data as { value?: unknown } | null)?.value;
    // value may be stored JSON-encoded — strip only surrounding quotes, never internal ones.
    const text = typeof v === "string" ? v.replace(/^"|"$/g, "").trim() : "";
    return text || null;
  } catch {
    return null;
  }
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
