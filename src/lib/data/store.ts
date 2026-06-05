/**
 * Data-access layer.
 *
 * MOCK mode: a mutable in-memory dataset from the seed (mutations persist for the
 * server process). LIVE mode (Supabase configured): ensureData() hydrates the
 * same Dataset shape from the DB per request, and mutations write through to
 * Supabase. Selectors/getters stay synchronous and unchanged — pages/actions
 * just `await ensureData()` first.
 */
import { cache } from "react";
import { appConfig, DATA_MODE } from "@/lib/config";
import type {
  AutomationLevel,
  Campaign,
  Cost,
  CreditSpendRequest,
  Dataset,
  Demo,
  DemoLostReason,
  Domain,
  DemoStatus,
  Lead,
  LeadStatus,
  Reply,
  ReplyStatus,
  SequenceVariant,
  SuppressionEntry,
} from "./types";
import { pushDemoDeal } from "@/lib/integrations/zoho-civ";
import { buildSeed } from "./seed";
import { loadAutomationLevel, loadDatasetLive } from "./live";
import { supabaseAdmin } from "./supabase";

const LIVE = DATA_MODE === "live";

let _data: Dataset | null = null;
let _automationLevel: AutomationLevel = "approve_all";

function db(): Dataset {
  if (!_data) _data = buildSeed();
  return _data;
}

const hydrateLive = cache(async () => {
  _data = await loadDatasetLive();
  _automationLevel = await loadAutomationLevel();
});

/** Populate the in-memory dataset for this request (live: from Supabase). */
export async function ensureData(): Promise<void> {
  if (LIVE) await hydrateLive();
  else if (!_data) _data = buildSeed();
}

async function liveUpsert(table: string, row: Record<string, unknown>, onConflict = "id") {
  if (!LIVE) return;
  const { error } = await supabaseAdmin().from(table).upsert(row, { onConflict });
  if (error) throw new Error(`${table} write failed: ${error.message}`);
}
async function liveDeleteRow(table: string, id: string) {
  if (!LIVE) return;
  await supabaseAdmin().from(table).delete().eq("id", id);
}

export function dataMode() {
  return DATA_MODE;
}

// --- raw getters (sync; read the hydrated dataset) --------------------------
export const getDataset = (): Dataset => db();
export const getUsers = () => db().users;
export const getPersonas = () => db().personas;
export const getDomains = () => db().domains;
export const getInboxes = () => db().inboxes;
export const getCampaigns = () => db().campaigns;
export const getLeads = () => db().leads;
export const getReplies = () => db().replies;
export const getSuppression = () => db().suppression;
export const getCreditMeters = () => db().creditMeters;
export const getCreditRequests = () => db().creditRequests;
export const getAudit = () => [...db().audit].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const getJobs = () => db().jobs;
export const getDemos = () => db().demos;
export const getVariants = () => db().variants;
export const getMetrics = () => db().metrics;
export const getCosts = () => db().costs;

export const getReply = (id: string) => db().replies.find((r) => r.id === id) ?? null;
export const getLead = (id: string) => db().leads.find((l) => l.id === id) ?? null;
export const getCampaign = (id: string) => db().campaigns.find((c) => c.id === id) ?? null;
export const getInbox = (id: string) => db().inboxes.find((i) => i.id === id) ?? null;

// --- automation dial --------------------------------------------------------
export const getAutomationLevel = () => _automationLevel;
export async function setAutomationLevel(level: AutomationLevel) {
  _automationLevel = level;
  await liveUpsert("settings", { key: "automation_level", value: level }, "key");
  await pushAudit("system", "automation.level_changed", "settings", null, { level });
  return _automationLevel;
}

// --- audit ------------------------------------------------------------------
export async function pushAudit(
  actor: string,
  action: string,
  entity: string,
  entityId: string | null,
  meta: Record<string, unknown> = {},
) {
  const id = `a_${Math.random().toString(36).slice(2, 9)}`;
  const createdAt = new Date().toISOString();
  db().audit.unshift({ id, actor, action, entity, entityId, meta, createdAt });
  await liveUpsert("audit_log", { id, actor, action, entity, entity_id: entityId, meta, created_at: createdAt });
}

// --- reply mutations --------------------------------------------------------
export async function updateReplyStatus(id: string, status: ReplyStatus, actor: string): Promise<Reply | null> {
  const reply = getReply(id);
  if (!reply) return null;
  if (reply.status !== "pending") return null; // already handled — don't re-send / re-action
  reply.status = status;
  reply.handledBy = actor;
  reply.handledAt = new Date().toISOString();
  await liveUpsert("replies", { id, status, handled_by: actor, handled_at: reply.handledAt });
  await pushAudit(actor, `reply.${status}`, "reply", id, { lead: reply.fromName });
  return reply;
}

export async function saveReplyDraft(id: string, draft: string): Promise<Reply | null> {
  const reply = getReply(id);
  if (!reply) return null;
  reply.aiDraft = draft;
  await liveUpsert("replies", { id, ai_draft: draft });
  return reply;
}

/** Undo a skip/snooze: return a handled reply to the pending queue. */
export async function revertReplyToPending(id: string, actor: string): Promise<Reply | null> {
  const reply = getReply(id);
  if (!reply) return null;
  reply.status = "pending";
  reply.handledBy = null;
  reply.handledAt = null;
  await liveUpsert("replies", { id, status: "pending", handled_by: null, handled_at: null });
  await pushAudit(actor, "reply.reopened", "reply", id, {});
  return reply;
}

// --- suppression: the global universe enforced at LOAD time -----------------
function norm(s: string) {
  return s.trim().toLowerCase();
}

export function isSuppressed(email: string): { suppressed: boolean; entry?: SuppressionEntry } {
  const e = norm(email);
  const domain = e.split("@")[1] ?? "";
  const entry = db().suppression.find(
    (s) => (s.email && norm(s.email) === e) || (s.domain && norm(s.domain) === domain),
  );
  return { suppressed: !!entry, entry };
}

export function dedupeAgainstUniverse(
  candidates: { email: string; [k: string]: unknown }[],
): { clean: typeof candidates; rejected: { email: string; reason: string }[] } {
  const clean: typeof candidates = [];
  const rejected: { email: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const e = norm(c.email);
    if (seen.has(e)) {
      rejected.push({ email: c.email, reason: "duplicate in list" });
      continue;
    }
    seen.add(e);
    const { suppressed, entry } = isSuppressed(c.email);
    if (suppressed) rejected.push({ email: c.email, reason: entry?.reason ?? "suppressed" });
    else clean.push(c);
  }
  return { clean, rejected };
}

export async function addSuppression(entry: Omit<SuppressionEntry, "id" | "createdAt">, actor = "system") {
  const row: SuppressionEntry = { ...entry, id: `sup_${Math.random().toString(36).slice(2, 9)}`, createdAt: new Date().toISOString() };
  db().suppression.unshift(row);
  await liveUpsert("suppression", {
    id: row.id, email: row.email, domain: row.domain, reason: row.reason,
    source: row.source, lead_id: row.leadId, note: row.note, created_at: row.createdAt,
  });
  await pushAudit(actor, "lead.suppressed", "suppression", row.id, { reason: row.reason, email: row.email });
  return row;
}

export function searchUniverse(query: string) {
  const q = norm(query);
  if (!q) return { leads: [], suppression: [] };
  return {
    leads: db().leads.filter(
      (l) =>
        l.email.toLowerCase().includes(q) ||
        l.domain.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q) ||
        `${l.firstName} ${l.lastName}`.toLowerCase().includes(q),
    ).slice(0, 50),
    suppression: db().suppression.filter(
      (s) => s.email?.toLowerCase().includes(q) || s.domain?.toLowerCase().includes(q),
    ).slice(0, 50),
  };
}

// --- credit guard -----------------------------------------------------------
export async function decideCreditRequest(id: string, decision: "approved" | "denied", actor: string): Promise<CreditSpendRequest | null> {
  const req = db().creditRequests.find((r) => r.id === id);
  if (!req) return null;
  if (req.status !== "pending") return null; // terminal requests can't be re-decided (no double-spend)
  if (decision === "approved" && req.requestedBy === actor) return null; // no self-approval
  req.status = decision;
  req.decidedBy = actor;
  req.decidedAt = new Date().toISOString();
  await liveUpsert("credit_requests", { id, status: decision, decided_by: actor, decided_at: req.decidedAt });
  await pushAudit(actor, `credit.${decision}`, "apollo_ciq", id, { amount: req.amount });
  return req;
}

export async function createCreditRequest(input: Pick<CreditSpendRequest, "provider" | "amount" | "reason" | "requestedBy">): Promise<CreditSpendRequest> {
  const req: CreditSpendRequest = { ...input, id: `cr_${Math.random().toString(36).slice(2, 9)}`, status: "pending", decidedBy: null, createdAt: new Date().toISOString(), decidedAt: null };
  db().creditRequests.unshift(req);
  await liveUpsert("credit_requests", {
    id: req.id, provider: req.provider, amount: req.amount, reason: req.reason,
    requested_by: req.requestedBy, status: req.status, created_at: req.createdAt,
  });
  await pushAudit(input.requestedBy, "credit.spend_requested", input.provider, req.id, { amount: input.amount });
  return req;
}

export async function executeCreditSpend(id: string, actor: string): Promise<CreditSpendRequest | null> {
  const req = db().creditRequests.find((r) => r.id === id);
  if (!req || req.status !== "approved") return null;
  req.status = "executed";
  await liveUpsert("credit_requests", { id, status: "executed" });
  // Reconcile the gated meter so spend is reflected. (The actual per-lead
  // apollo.enrichWithCiqCredits calls happen in the enrichment flow with this
  // approved request id as the audit-logged authorization.)
  const meter = db().creditMeters.find((m) => m.provider === req.provider);
  if (meter) {
    meter.used = Math.min(meter.total, meter.used + req.amount);
    await liveUpsert("credit_meters", { provider: meter.provider, used: meter.used }, "provider");
  }
  await pushAudit(actor, "credit.executed", "apollo_ciq", id, { amount: req.amount });
  return req;
}

// --- costs (P&L) ------------------------------------------------------------
export async function addCost(input: Omit<Cost, "id" | "startedAt" | "source" | "createdBy">, actor = "system"): Promise<Cost> {
  const cost: Cost = { ...input, id: `co_${Math.random().toString(36).slice(2, 9)}`, startedAt: new Date().toISOString(), source: "manual", createdBy: actor };
  db().costs.unshift(cost);
  await liveUpsert("costs", {
    id: cost.id, category: cost.category, vendor: cost.vendor, description: cost.description,
    amount: cost.amount, cadence: cost.cadence, status: cost.status, started_at: cost.startedAt,
    next_charge_at: cost.nextChargeAt, source: cost.source, note: cost.note, created_by: cost.createdBy,
  });
  await pushAudit(actor, "cost.added", "cost", cost.id, { vendor: cost.vendor, amount: cost.amount, cadence: cost.cadence });
  return cost;
}

export async function deleteCost(id: string, actor = "system"): Promise<boolean> {
  const costs = db().costs;
  const i = costs.findIndex((c) => c.id === id);
  if (i === -1) return false;
  costs.splice(i, 1);
  await liveDeleteRow("costs", id);
  await pushAudit(actor, "cost.removed", "cost", id, {});
  return true;
}

// --- campaigns --------------------------------------------------------------
export async function addCampaign(input: Pick<Campaign, "name" | "vertical" | "personaId" | "dailyCap">, actor = "system"): Promise<Campaign> {
  const slug = input.vertical.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "general";
  const campaign: Campaign = {
    id: `c_${Math.random().toString(36).slice(2, 9)}`,
    name: input.name, vertical: input.vertical || "General", personaId: input.personaId,
    status: "draft", instantlyCampaignId: null, listVersion: `${slug}_v1`, inboxIds: [],
    dailyCap: input.dailyCap || 80, createdAt: new Date().toISOString(),
  };
  db().campaigns.unshift(campaign);
  await liveUpsert("campaigns", {
    id: campaign.id, name: campaign.name, vertical: campaign.vertical, persona_id: campaign.personaId,
    status: campaign.status, list_version: campaign.listVersion, inbox_ids: campaign.inboxIds,
    daily_cap: campaign.dailyCap, created_at: campaign.createdAt,
  });
  await pushAudit(actor, "campaign.created", "campaign", campaign.id, { name: campaign.name, vertical: campaign.vertical });
  return campaign;
}

export async function setCampaignStatus(id: string, status: Campaign["status"], actor: string) {
  const c = getCampaign(id);
  if (!c) return null;
  c.status = status;
  await liveUpsert("campaigns", { id, status });
  await pushAudit(actor, `campaign.${status}`, "campaign", id, { name: c.name });
  return c;
}

export async function cloneCampaign(id: string, actor: string): Promise<Campaign | null> {
  const src = getCampaign(id);
  if (!src) return null;
  const newId = `c_${Math.random().toString(36).slice(2, 9)}`;
  const clone: Campaign = { ...src, id: newId, name: `${src.name} (copy)`, status: "draft", instantlyCampaignId: null, createdAt: new Date().toISOString() };
  db().campaigns.unshift(clone);
  await liveUpsert("campaigns", {
    id: newId, name: clone.name, vertical: clone.vertical, persona_id: clone.personaId,
    status: "draft", list_version: clone.listVersion, inbox_ids: clone.inboxIds,
    daily_cap: clone.dailyCap, created_at: clone.createdAt,
  });
  for (const v of db().variants.filter((x) => x.campaignId === id)) {
    const vid = `sv_${newId}_${v.step}_${v.variant}`;
    db().variants.push({ ...v, id: vid, campaignId: newId, sent: 0, opens: 0, replies: 0, positives: 0 });
    await liveUpsert("sequence_variants", { id: vid, campaign_id: newId, step: v.step, variant: v.variant, subject: v.subject, body: v.body, sent: 0, opens: 0, replies: 0, positives: 0, approved: v.approved });
  }
  await pushAudit(actor, "campaign.cloned", "campaign", newId, { from: id, name: clone.name });
  return clone;
}

// --- leads (sourced -> persisted with attribution at source) ----------------
export type NewLead = Omit<Lead, "id" | "createdAt">;

/** Bulk-insert sourced leads. Attribution (campaign/vertical/persona/domain/source) is
 *  baked into each record by the caller — it can't be reconstructed later. */
export async function addLeads(inputs: NewLead[], actor = "system"): Promise<Lead[]> {
  if (!inputs.length) return [];
  const now = new Date().toISOString();
  const created: Lead[] = inputs.map((i) => ({ ...i, id: `l_${Math.random().toString(36).slice(2, 9)}`, createdAt: now }));
  for (const lead of created) db().leads.unshift(lead);
  if (LIVE) {
    const rows = created.map((l) => ({
      id: l.id, email: l.email, domain: l.domain, first_name: l.firstName, last_name: l.lastName,
      company: l.company, title: l.title, phone: l.phone, campaign_id: l.campaignId, vertical: l.vertical,
      persona: l.persona, sending_domain: l.sendingDomain, list_version: l.listVersion, source: l.source,
      attribution_owner: l.attributionOwner, status: l.status, zoho_lead_id: l.zohoLeadId, apollo_id: l.apolloId,
      created_at: l.createdAt, last_contacted_at: l.lastContactedAt,
    }));
    const { error } = await supabaseAdmin().from("leads").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`leads write failed: ${error.message}`);
  }
  await pushAudit(actor, "leads.loaded", "lead", created[0]?.campaignId ?? null, { count: created.length, source: created[0]?.source });
  return created;
}

/** Stamp the canonical Zoho id onto a persisted lead (after Zoho create). */
export async function setLeadZohoId(id: string, zohoLeadId: string) {
  const lead = getLead(id);
  if (!lead) return;
  lead.zohoLeadId = zohoLeadId;
  await liveUpsert("leads", { id, zoho_lead_id: zohoLeadId });
}

/** Move a lead through its lifecycle (reply DNC -> lost, demo flow -> closed, ...). */
export async function setLeadStatus(id: string, status: LeadStatus, actor = "system") {
  const lead = getLead(id);
  if (!lead) return null;
  lead.status = status;
  await liveUpsert("leads", { id, status });
  await pushAudit(actor, `lead.${status}`, "lead", id, {});
  return lead;
}

// --- demos / pipeline (book -> CIQ deal -> outcome -> MRR) ------------------
export async function addDemo(input: { leadId: string; scheduledAt: string; owner: string; mrr?: number | null }, actor = "system"): Promise<Demo> {
  const demo: Demo = {
    id: `d_${Math.random().toString(36).slice(2, 9)}`,
    leadId: input.leadId, scheduledAt: input.scheduledAt, status: "booked",
    owner: input.owner, mrr: input.mrr ?? null,
    outcomeReason: null, outcomeNote: null, outcomeAt: null, civDealId: null, reminderSentAt: null,
  };
  db().demos.unshift(demo);
  // Hand the booked demo straight into ConversionIQ's pipeline (fail-safe).
  const lead = getLead(input.leadId);
  if (lead) {
    const { dealId } = await pushDemoDeal(lead, demo);
    demo.civDealId = dealId;
  }
  await liveUpsert("demos", { id: demo.id, lead_id: demo.leadId, scheduled_at: demo.scheduledAt, status: demo.status, owner: demo.owner, mrr: demo.mrr, civ_deal_id: demo.civDealId });
  await setLeadStatus(demo.leadId, "demo_booked", actor);
  await pushAudit(actor, "demo.booked", "demo", demo.id, { leadId: demo.leadId, civDealId: demo.civDealId });
  return demo;
}

// Demo status drives the lead lifecycle (no_show leaves the lead where it is).
const DEMO_TO_LEAD: Partial<Record<DemoStatus, LeadStatus>> = {
  booked: "demo_booked", showed: "demo_showed", closed: "closed", lost: "lost",
};

export async function updateDemo(id: string, patch: { status?: DemoStatus; mrr?: number | null }, actor = "system"): Promise<Demo | null> {
  const demo = db().demos.find((d) => d.id === id);
  if (!demo) return null;
  if (patch.status) demo.status = patch.status;
  if (patch.mrr !== undefined) demo.mrr = patch.mrr;
  await liveUpsert("demos", { id, status: demo.status, mrr: demo.mrr });
  const leadStatus = patch.status ? DEMO_TO_LEAD[patch.status] : undefined;
  if (leadStatus) await setLeadStatus(demo.leadId, leadStatus, actor);
  await pushAudit(actor, `demo.${demo.status}`, "demo", id, { mrr: demo.mrr });
  return demo;
}

/**
 * The post-demo outcome from whoever ran it (Jon) — the training signal for the loop.
 * won -> closed + MRR (feeds residual); lost -> lost + a structured reason. Both keep
 * the lead lifecycle in lockstep. Callable from the in-hub control or the CIQ webhook.
 */
export async function recordDemoOutcome(
  id: string,
  input: { result: "won" | "lost"; reason?: DemoLostReason | null; note?: string | null; mrr?: number | null },
  actor = "system",
): Promise<Demo | null> {
  const demo = db().demos.find((d) => d.id === id);
  if (!demo) return null;
  demo.outcomeAt = new Date().toISOString();
  if (input.note != null) demo.outcomeNote = input.note;
  if (input.result === "won") {
    demo.status = "closed";
    if (input.mrr != null) demo.mrr = Math.max(0, Math.round(input.mrr));
    demo.outcomeReason = null;
  } else {
    demo.status = "lost";
    demo.outcomeReason = input.reason ?? "other";
  }
  await liveUpsert("demos", { id, status: demo.status, mrr: demo.mrr, outcome_reason: demo.outcomeReason, outcome_note: demo.outcomeNote, outcome_at: demo.outcomeAt });
  await setLeadStatus(demo.leadId, demo.status === "closed" ? "closed" : "lost", actor);
  await pushAudit(actor, `demo.${input.result}`, "demo", id, { reason: demo.outcomeReason, mrr: demo.mrr });
  return demo;
}

/** No-show defense: stamp when a reminder went out (used by the reminders job). */
export async function markDemoReminded(id: string, actor = "system"): Promise<Demo | null> {
  const demo = db().demos.find((d) => d.id === id);
  if (!demo) return null;
  demo.reminderSentAt = new Date().toISOString();
  await liveUpsert("demos", { id, reminder_sent_at: demo.reminderSentAt });
  await pushAudit(actor, "demo.reminded", "demo", id, {});
  return demo;
}

/** Reconcile a CIQ Zoho deal back to our demo (used by the outcome webhook). */
export function getDemoByCivDealId(civDealId: string): Demo | undefined {
  if (!civDealId) return undefined;
  return db().demos.find((d) => d.civDealId === civDealId);
}

// --- campaign copy (inline sequence editing) --------------------------------
export async function updateVariant(id: string, patch: { subject?: string; body?: string }, actor = "system"): Promise<SequenceVariant | null> {
  const v = db().variants.find((x) => x.id === id);
  if (!v) return null;
  if (patch.subject !== undefined) v.subject = patch.subject;
  if (patch.body !== undefined) v.body = patch.body;
  await liveUpsert("sequence_variants", { id, subject: v.subject, body: v.body });
  await pushAudit(actor, "variant.edited", "campaign", v.campaignId, { variantId: id, step: v.step, variant: v.variant });
  return v;
}

// --- deliverability ---------------------------------------------------------
/** Write real SPF/DKIM/DMARC status (from the DNS verifier) onto a domain. */
export async function updateDomainAuth(id: string, patch: { spf?: boolean; dkim?: boolean; dmarc?: boolean }): Promise<Domain | null> {
  const d = db().domains.find((x) => x.id === id);
  if (!d) return null;
  if (patch.spf !== undefined) d.spf = patch.spf;
  if (patch.dkim !== undefined) d.dkim = patch.dkim;
  if (patch.dmarc !== undefined) d.dmarc = patch.dmarc;
  d.reputation = d.spf && d.dkim && d.dmarc ? "green" : !d.spf || !d.dmarc ? "red" : "yellow";
  await liveUpsert("domains", { id, spf: d.spf, dkim: d.dkim, dmarc: d.dmarc, reputation: d.reputation });
  return d;
}

export async function pauseInbox(id: string, actor: string, reason: string) {
  const inbox = getInbox(id);
  if (!inbox) return null;
  inbox.status = "paused";
  await liveUpsert("inboxes", { id, status: "paused" });
  await pushAudit(actor, "inbox.paused", "inbox", id, { reason });
  return inbox;
}

export async function resumeInbox(id: string, actor: string) {
  const inbox = getInbox(id);
  if (!inbox) return null;
  inbox.status = inbox.warmupScore >= appConfig.deliverability.warmupGate ? "active" : "warming";
  await liveUpsert("inboxes", { id, status: inbox.status });
  await pushAudit(actor, "inbox.resumed", "inbox", id, {});
  return inbox;
}

/**
 * Feed a real bounce (from the Instantly webhook) into the sending inbox's rate, so the
 * inbox-level auto-pause guardrail can actually trip. Approximate — the model has no clean
 * per-inbox sent denominator, so we nudge against sentToday (floored); the precise rate is
 * reconciled from analytics on sync. Looks up the inbox by its sending address (eaccount).
 */
export async function recordInboxBounce(eaccount: string) {
  const inbox = db().inboxes.find((i) => i.email.toLowerCase() === eaccount.toLowerCase());
  if (!inbox) return null;
  const denom = Math.max(inbox.sentToday, 20);
  inbox.bounceRate = Math.min(1, inbox.bounceRate + 1 / denom);
  await liveUpsert("inboxes", { id: inbox.id, bounce_rate: inbox.bounceRate });
  return inbox;
}
