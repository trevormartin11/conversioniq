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
import { appConfig, DATA_MODE, integrations } from "@/lib/config";
import type {
  AutomationLevel,
  Campaign,
  ChannelAccount,
  ChannelAccountStatus,
  ConsentRecord,
  ConsentSource,
  ConsentStatus,
  Cost,
  Dataset,
  Demo,
  DemoLostReason,
  Domain,
  DemoStatus,
  Lead,
  LeadStatus,
  OutreachChannel,
  OutreachMessage,
  OutreachStatus,
  Reply,
  ReplyStatus,
  SequenceVariant,
  SuppressionEntry,
  TenDlcStatus,
  LandingContent,
  LandingPage,
} from "./types";
import { capRemaining, findConsent, GATE_REASONS, normalizeHandle, sendGate } from "@/lib/channels/policy";
import { isLikelyEmail } from "@/lib/email";
import { pushDemoDeal } from "@/lib/integrations/zoho-civ";
import { sendSms } from "@/lib/integrations/twilio";
import { generateLandingContent } from "@/lib/ai/landing";
import { buildSeed } from "./seed";
import { loadAutomationLevel, loadAssumptions, loadDatasetLive, loadIcp } from "./live";
import { supabaseAdmin } from "./supabase";

const LIVE = DATA_MODE === "live";

// In-memory runtime state lives on globalThis, NOT in module-level `let`s. Next's App Router
// can instantiate this module separately for the Server Action layer and the RSC render layer
// (and dev HMR re-evaluates modules), so a plain `let` is not shared — a write inside an action
// would be invisible to the page that renders right after it (created campaign → 404). globalThis
// is the single surface shared across those instances within a process.
interface RuntimeState {
  data: Dataset | null;
  automationLevel: AutomationLevel;
  assumptions: { closeRate: number; monthlyMrr: number };
  icp: string | null; // operator-edited ICP override; null → use the built-in default
}
const rt: RuntimeState = ((globalThis as unknown as { __ciqRuntime?: RuntimeState }).__ciqRuntime ??= {
  data: null,
  automationLevel: "approve_all",
  assumptions: {
    closeRate: appConfig.projection.assumedCloseRate,
    monthlyMrr: appConfig.projection.assumedMonthlyMrr,
  },
  icp: null,
});

function db(): Dataset {
  if (!rt.data) rt.data = buildSeed();
  return rt.data;
}

const hydrateLive = cache(async () => {
  rt.data = await loadDatasetLive();
  rt.automationLevel = await loadAutomationLevel();
  rt.assumptions = await loadAssumptions();
  rt.icp = await loadIcp();
});

/** Populate the in-memory dataset for this request (live: from Supabase). */
export async function ensureData(): Promise<void> {
  if (LIVE) await hydrateLive();
  else if (!rt.data) rt.data = buildSeed();
}

async function liveUpsert(table: string, row: Record<string, unknown>, onConflict = "id") {
  if (!LIVE) return;
  const { error } = await supabaseAdmin().from(table).upsert(row, { onConflict });
  if (error) throw new Error(`${table} write failed: ${error.message}`);
}

/** Patch an EXISTING row — a plain UPDATE, never an insert. Partial patches must not go
 *  through liveUpsert: Postgres builds the upsert's insert tuple before conflict arbitration,
 *  so any missing not-null column without a default (name, email, domain…) aborts the write
 *  even when the row already exists — which silently broke every status/patch write in live mode. */
async function liveUpdate(table: string, id: string, patch: Record<string, unknown>, idCol = "id") {
  if (!LIVE) return;
  const { error } = await supabaseAdmin().from(table).update(patch).eq(idCol, id);
  if (error) throw new Error(`${table} update failed: ${error.message}`);
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
export const getAudit = () => [...db().audit].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const getJobs = () => db().jobs;
export const getDemos = () => db().demos;
export const getVariants = () => db().variants;
export const getMetrics = () => db().metrics;
export const getCosts = () => db().costs;
export const getConsent = () => db().consent;
export const getChannelAccounts = () => db().channelAccounts;
export const getOutreach = () => [...db().outreach].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const getChannelAccount = (id: string) => db().channelAccounts.find((a) => a.id === id) ?? null;
export const getOutreachMessage = (id: string) => db().outreach.find((o) => o.id === id) ?? null;

export const getReply = (id: string) => db().replies.find((r) => r.id === id) ?? null;
export const getLead = (id: string) => db().leads.find((l) => l.id === id) ?? null;
export const getCampaign = (id: string) => db().campaigns.find((c) => c.id === id) ?? null;
export const getInbox = (id: string) => db().inboxes.find((i) => i.id === id) ?? null;

// --- automation dial --------------------------------------------------------
export const getAutomationLevel = () => rt.automationLevel;
export async function setAutomationLevel(level: AutomationLevel) {
  rt.automationLevel = level;
  await liveUpsert("settings", { key: "automation_level", value: level }, "key");
  await pushAudit("system", "automation.level_changed", "settings", null, { level });
  return rt.automationLevel;
}

// --- forward-projection assumptions (operator-set; never inferred from CIQ) --
export interface Assumptions {
  closeRate: number;
  monthlyMrr: number;
}
export const getAssumptions = (): Assumptions => rt.assumptions;
export async function setAssumptions(input: Partial<Assumptions>): Promise<Assumptions> {
  const closeRate = Math.min(1, Math.max(0, Number(input.closeRate ?? rt.assumptions.closeRate) || 0));
  const monthlyMrr = Math.max(0, Math.round(Number(input.monthlyMrr ?? rt.assumptions.monthlyMrr) || 0));
  rt.assumptions = { closeRate, monthlyMrr };
  await liveUpsert("settings", { key: "assumed_close_rate", value: String(closeRate) }, "key");
  await liveUpsert("settings", { key: "assumed_monthly_mrr", value: String(monthlyMrr) }, "key");
  await pushAudit("system", "assumptions.changed", "settings", null, rt.assumptions);
  return rt.assumptions;
}

// --- ICP ("who we win with") — operator-edited, persisted, read by the strategy AI -----------
/** The current ICP override, or null when none is set (callers fall back to the built-in default). */
export const getIcp = (): string | null => rt.icp;
export async function setIcp(text: string, actor = "system"): Promise<string | null> {
  rt.icp = text.trim() || null; // empty clears the override → back to the default
  await liveUpsert("settings", { key: "icp_fit", value: rt.icp ?? "" }, "key");
  await pushAudit(actor, "icp.changed", "settings", null, { length: rt.icp?.length ?? 0 });
  return rt.icp;
}

// --- audit ------------------------------------------------------------------
/** Best-effort: the audit log is observability, not correctness. It sits at the tail of
 *  nearly every mutation — an audit-table hiccup must never fail (or retry-double) an
 *  operation whose real writes already succeeded. */
export async function pushAudit(
  actor: string,
  action: string,
  entity: string,
  entityId: string | null,
  meta: Record<string, unknown> = {},
) {
  const id = `a_${crypto.randomUUID().slice(0, 13)}`;
  const createdAt = new Date().toISOString();
  db().audit.unshift({ id, actor, action, entity, entityId, meta, createdAt });
  try {
    await liveUpsert("audit_log", { id, actor, action, entity, entity_id: entityId, meta, created_at: createdAt });
  } catch (e) {
    console.warn(`[audit] write failed (non-fatal): ${(e as Error).message}`);
  }
}

// --- reply mutations --------------------------------------------------------
export async function updateReplyStatus(id: string, status: ReplyStatus, actor: string): Promise<Reply | null> {
  const reply = getReply(id);
  if (!reply) return null;
  if (reply.status !== "pending") return null; // already handled — don't re-send / re-action
  reply.status = status;
  reply.handledBy = actor;
  reply.handledAt = new Date().toISOString();
  await liveUpdate("replies", id, { status, handled_by: actor, handled_at: reply.handledAt });
  await pushAudit(actor, `reply.${status}`, "reply", id, { lead: reply.fromName });
  return reply;
}

/**
 * Atomically claim a pending reply for sending. The DB write is CONDITIONAL on
 * status='pending' (UPDATE … WHERE status='pending'), so two concurrent approvals —
 * double-click, second tab, retry after a blip — can't both win: the loser gets null
 * and must not send. Claim BEFORE the external send; on send failure, releaseReplyClaim.
 */
export async function claimReply(id: string, actor: string): Promise<Reply | null> {
  const reply = getReply(id);
  if (!reply || reply.status !== "pending") return null;
  const handledAt = new Date().toISOString();
  if (LIVE) {
    const { data, error } = await supabaseAdmin()
      .from("replies")
      .update({ status: "sent", handled_by: actor, handled_at: handledAt })
      .eq("id", id)
      .eq("status", "pending")
      .select("id");
    if (error) throw new Error(`replies claim failed: ${error.message}`);
    if (!data?.length) return null; // lost the race — another request already handled it
  }
  reply.status = "sent";
  reply.handledBy = actor;
  reply.handledAt = handledAt;
  return reply;
}

/** Roll a claimed-but-unsent reply back to the queue (the send failed after the claim). */
export async function releaseReplyClaim(id: string): Promise<void> {
  const reply = getReply(id);
  if (reply) {
    reply.status = "pending";
    reply.handledBy = null;
    reply.handledAt = null;
  }
  await liveUpdate("replies", id, { status: "pending", handled_by: null, handled_at: null });
}

export async function saveReplyDraft(id: string, draft: string): Promise<Reply | null> {
  const reply = getReply(id);
  if (!reply) return null;
  reply.aiDraft = draft;
  await liveUpdate("replies", id, { ai_draft: draft });
  return reply;
}

/** Undo a skip/snooze: return a handled reply to the pending queue. */
export async function revertReplyToPending(id: string, actor: string): Promise<Reply | null> {
  const reply = getReply(id);
  if (!reply) return null;
  reply.status = "pending";
  reply.handledBy = null;
  reply.handledAt = null;
  await liveUpdate("replies", id, { status: "pending", handled_by: null, handled_at: null });
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

export function dedupeAgainstUniverse<T extends { email: string }>(
  candidates: T[],
): { clean: T[]; rejected: { email: string; reason: string }[] } {
  const clean: T[] = [];
  const rejected: { email: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const e = norm(c.email);
    if (!isLikelyEmail(e)) {
      rejected.push({ email: c.email, reason: "invalid" });
      continue;
    }
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
  const row: SuppressionEntry = { ...entry, id: `sup_${crypto.randomUUID().slice(0, 13)}`, createdAt: new Date().toISOString() };
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

// --- costs (P&L) ------------------------------------------------------------
export async function addCost(input: Omit<Cost, "id" | "startedAt" | "source" | "createdBy">, actor = "system"): Promise<Cost> {
  const cost: Cost = { ...input, id: `co_${crypto.randomUUID().slice(0, 13)}`, startedAt: new Date().toISOString(), source: "manual", createdBy: actor };
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
    id: `c_${crypto.randomUUID().slice(0, 13)}`,
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
  await liveUpdate("campaigns", id, { status });
  await pushAudit(actor, `campaign.${status}`, "campaign", id, { name: c.name });
  return c;
}

export async function cloneCampaign(id: string, actor: string): Promise<Campaign | null> {
  const src = getCampaign(id);
  if (!src) return null;
  const newId = `c_${crypto.randomUUID().slice(0, 13)}`;
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

/** Permanently remove a campaign and its sequence variants from the hub. Caller is responsible for
 *  any external cleanup (e.g. deleting the linked Instantly campaign) before invoking this. */
export async function deleteCampaign(id: string, actor: string): Promise<Campaign | null> {
  const c = getCampaign(id);
  if (!c) return null;
  db().campaigns = db().campaigns.filter((x) => x.id !== id);
  db().variants = db().variants.filter((v) => v.campaignId !== id);
  if (LIVE) {
    await supabaseAdmin().from("sequence_variants").delete().eq("campaign_id", id);
    await supabaseAdmin().from("campaigns").delete().eq("id", id);
  }
  await pushAudit(actor, "campaign.deleted", "campaign", id, { name: c.name });
  return c;
}

// --- leads (sourced -> persisted with attribution at source) ----------------
export type NewLead = Omit<Lead, "id" | "createdAt">;

/** Move any leads attached to one campaign over to another (used when a staging draft is replaced by
 *  its canonical Instantly-linked campaign on push). Returns the number of leads moved. */
export async function reassignCampaignLeads(fromId: string, toId: string, actor = "system"): Promise<number> {
  const moving = db().leads.filter((l) => l.campaignId === fromId);
  if (!moving.length) return 0;
  for (const l of moving) l.campaignId = toId;
  if (LIVE) {
    await supabaseAdmin().from("leads").update({ campaign_id: toId }).eq("campaign_id", fromId);
  }
  await pushAudit(actor, "leads.reassigned", "campaign", toId, { from: fromId, count: moving.length });
  return moving.length;
}

/** Bulk-insert sourced leads. Attribution (campaign/vertical/persona/domain/source) is
 *  baked into each record by the caller — it can't be reconstructed later. */
export async function addLeads(inputs: NewLead[], actor = "system"): Promise<Lead[]> {
  if (!inputs.length) return [];
  const now = new Date().toISOString();
  const created: Lead[] = inputs.map((i) => ({ ...i, id: `l_${crypto.randomUUID().slice(0, 13)}`, createdAt: now }));
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
  await liveUpdate("leads", id, { zoho_lead_id: zohoLeadId });
}

/** Move a lead through its lifecycle (reply DNC -> lost, demo flow -> closed, ...). */
export async function setLeadStatus(id: string, status: LeadStatus, actor = "system") {
  const lead = getLead(id);
  if (!lead) return null;
  lead.status = status;
  await liveUpdate("leads", id, { status });
  await pushAudit(actor, `lead.${status}`, "lead", id, {});
  return lead;
}

// --- demos / pipeline (book -> CIQ deal -> outcome -> MRR) ------------------
export async function addDemo(input: { leadId: string; scheduledAt: string; owner: string; mrr?: number | null }, actor = "system"): Promise<Demo> {
  // Idempotency: one open demo per lead — a double-click on "Book demo" must not hand
  // ConversionIQ two deals for the same prospect. Return the existing open demo instead.
  const open = db().demos.find((d) => d.leadId === input.leadId && (d.status === "booked" || d.status === "showed" || d.status === "no_show"));
  if (open) return open;
  const demo: Demo = {
    id: `d_${crypto.randomUUID().slice(0, 13)}`,
    leadId: input.leadId, scheduledAt: input.scheduledAt, status: "booked",
    owner: input.owner, mrr: input.mrr ?? null,
    outcomeReason: null, outcomeNote: null, outcomeAt: null, civDealId: null, reminderSentAt: null,
  };
  db().demos.unshift(demo);
  // Persist FIRST, push the CIQ deal after: a failed insert must not strand a deal in
  // ConversionIQ's pipeline (the retry would create a second one their team has to chase).
  await liveUpsert("demos", { id: demo.id, lead_id: demo.leadId, scheduled_at: demo.scheduledAt, status: demo.status, owner: demo.owner, mrr: demo.mrr });
  const lead = getLead(input.leadId);
  if (lead) {
    const { dealId } = await pushDemoDeal(lead, demo);
    if (dealId) {
      demo.civDealId = dealId;
      await liveUpdate("demos", demo.id, { civ_deal_id: dealId });
    }
  }
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
  await liveUpdate("demos", id, { status: demo.status, mrr: demo.mrr });
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
  await liveUpdate("demos", id, { status: demo.status, mrr: demo.mrr, outcome_reason: demo.outcomeReason, outcome_note: demo.outcomeNote, outcome_at: demo.outcomeAt });
  await setLeadStatus(demo.leadId, demo.status === "closed" ? "closed" : "lost", actor);
  await pushAudit(actor, `demo.${input.result}`, "demo", id, { reason: demo.outcomeReason, mrr: demo.mrr });
  return demo;
}

/** No-show defense: stamp when a reminder went out (used by the reminders job). */
export async function markDemoReminded(id: string, actor = "system"): Promise<Demo | null> {
  const demo = db().demos.find((d) => d.id === id);
  if (!demo) return null;
  demo.reminderSentAt = new Date().toISOString();
  await liveUpdate("demos", id, { reminder_sent_at: demo.reminderSentAt });
  await pushAudit(actor, "demo.reminded", "demo", id, {});
  return demo;
}

/** Reconcile a CIQ Zoho deal back to our demo (used by the outcome webhook). */
export function getDemoByCivDealId(civDealId: string): Demo | undefined {
  if (!civDealId) return undefined;
  return db().demos.find((d) => d.civDealId === civDealId);
}

/**
 * Reconcile a CIQ outcome to a demo by the contact's email when no deal id matches — e.g.
 * CIQ's workflow posts the contact email instead of our deal id. Picks the most recent
 * still-open demo (booked/showed/no_show) for the lead with that email.
 */
export function getOpenDemoByEmail(email: string): Demo | undefined {
  const norm = email.trim().toLowerCase();
  if (!norm) return undefined;
  const lead = db().leads.find((l) => l.email?.toLowerCase() === norm);
  if (!lead) return undefined;
  return db()
    .demos.filter((d) => d.leadId === lead.id && d.status !== "closed" && d.status !== "lost")
    .sort((a, b) => (b.scheduledAt > a.scheduledAt ? 1 : -1))[0];
}

/** Seed a new campaign's sequence from authored steps (e.g. the launch wizard) — one "A" variant
 *  per step. Idempotent by deterministic id, so re-seeding overwrites rather than duplicates. */
export async function seedCampaignVariants(
  campaignId: string,
  steps: { step: number; subject: string; body: string }[],
  actor = "system",
): Promise<number> {
  let n = 0;
  for (const st of steps) {
    const subject = (st.subject ?? "").trim();
    const body = (st.body ?? "").trim();
    if (!subject && !body) continue;
    const id = `sv_${campaignId}_${st.step}_A`;
    const variant: SequenceVariant = { id, campaignId, step: st.step, variant: "A", subject, body, sent: 0, opens: 0, replies: 0, positives: 0, approved: true };
    const idx = db().variants.findIndex((v) => v.id === id);
    if (idx >= 0) db().variants[idx] = variant;
    else db().variants.push(variant);
    await liveUpsert("sequence_variants", {
      id, campaign_id: campaignId, step: st.step, variant: "A",
      subject, body, sent: 0, opens: 0, replies: 0, positives: 0, approved: true,
    });
    n++;
  }
  if (n) await pushAudit(actor, "campaign.sequence_seeded", "campaign", campaignId, { steps: n });
  return n;
}

// --- campaign copy (inline sequence editing) --------------------------------
export async function updateVariant(id: string, patch: { subject?: string; body?: string }, actor = "system"): Promise<SequenceVariant | null> {
  const v = db().variants.find((x) => x.id === id);
  if (!v) return null;
  if (patch.subject !== undefined) v.subject = patch.subject;
  if (patch.body !== undefined) v.body = patch.body;
  await liveUpdate("sequence_variants", id, { subject: v.subject, body: v.body });
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
  await liveUpdate("domains", id, { spf: d.spf, dkim: d.dkim, dmarc: d.dmarc, reputation: d.reputation });
  return d;
}

export async function pauseInbox(id: string, actor: string, reason: string) {
  const inbox = getInbox(id);
  if (!inbox) return null;
  inbox.status = "paused";
  await liveUpdate("inboxes", id, { status: "paused" });
  await pushAudit(actor, "inbox.paused", "inbox", id, { reason });
  return inbox;
}

export async function resumeInbox(id: string, actor: string) {
  const inbox = getInbox(id);
  if (!inbox) return null;
  inbox.status = inbox.warmupScore >= appConfig.deliverability.warmupGate ? "active" : "warming";
  await liveUpdate("inboxes", id, { status: inbox.status });
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
  await liveUpdate("inboxes", inbox.id, { bounce_rate: inbox.bounceRate });
  return inbox;
}

// --- channels: consent ledger + SMS/social DM queue -------------------------
// SMS is consent-gated (TCPA) and social DMs are AI-drafted but human-sent. The send
// chokepoint (sendOutreach) is the only place a message leaves, so the policy is enforced once.

function defaultAccountFor(channel: OutreachChannel): ChannelAccount | undefined {
  const accts = db().channelAccounts.filter((a) => a.channel === channel);
  return accts.find((a) => a.status === "active") ?? accts[0];
}

function outreachRow(m: OutreachMessage): Record<string, unknown> {
  return {
    id: m.id, channel: m.channel, lead_id: m.leadId, campaign_id: m.campaignId, account_id: m.accountId,
    to_name: m.toName, to_handle: m.toHandle, body: m.body, status: m.status, source: m.source,
    consent_id: m.consentId, profile_url: m.profileUrl, rationale: m.rationale, created_at: m.createdAt,
    scheduled_at: m.scheduledAt, sent_at: m.sentAt, approved_by: m.approvedBy, sent_by: m.sentBy, note: m.note,
  };
}

/**
 * Record (or update) a consent record for a (channel, handle). Opting in/out also reconciles
 * the SMS queue so a fresh opt-in unblocks parked drafts and an opt-out (STOP) re-blocks them.
 */
export async function recordConsent(
  input: { leadId?: string | null; channel: OutreachChannel; handle: string; status?: ConsentStatus; source: ConsentSource; proof?: string | null; note?: string | null },
  actor = "system",
): Promise<ConsentRecord> {
  const handle = normalizeHandle(input.channel, input.handle);
  const now = new Date().toISOString();
  const status: ConsentStatus = input.status ?? "opted_in";
  let saved = db().consent.find((c) => c.channel === input.channel && normalizeHandle(c.channel, c.handle) === handle);
  if (saved) {
    saved.status = status;
    saved.source = input.source;
    if (input.proof !== undefined) saved.proof = input.proof;
    if (input.note !== undefined) saved.note = input.note;
    if (input.leadId) saved.leadId = input.leadId;
    saved.updatedAt = now;
  } else {
    saved = {
      id: `cs_${crypto.randomUUID().slice(0, 13)}`,
      leadId: input.leadId ?? null, channel: input.channel, handle, status,
      source: input.source, proof: input.proof ?? null, capturedAt: now, updatedAt: now, note: input.note ?? null,
    };
    db().consent.unshift(saved);
  }
  await liveUpsert("consent_records", {
    id: saved.id, lead_id: saved.leadId, channel: saved.channel, handle: saved.handle, status: saved.status,
    source: saved.source, proof: saved.proof, captured_at: saved.capturedAt, updated_at: saved.updatedAt, note: saved.note,
  });
  // Keep the SMS queue consistent with the consent change.
  if (input.channel === "sms") {
    for (const m of db().outreach.filter((o) => o.channel === "sms" && normalizeHandle("sms", o.toHandle) === handle && o.status !== "sent" && o.status !== "skipped")) {
      if (status === "opted_in" && m.status === "needs_consent") {
        m.status = "draft";
        m.consentId = saved.id;
        await liveUpdate("outreach_messages", m.id, { status: m.status, consent_id: m.consentId });
      } else if (status === "opted_out" && (m.status === "draft" || m.status === "approved")) {
        m.status = "needs_consent";
        await liveUpdate("outreach_messages", m.id, { status: m.status });
      }
    }
  }
  await pushAudit(actor, `consent.${status}`, "consent", saved.id, { channel: saved.channel, handle: saved.handle, source: saved.source });
  return saved;
}

/** STOP handling / manual opt-out. Creates a record if none exists so the block is enforced. */
export async function setConsentStatus(channel: OutreachChannel, handle: string, status: ConsentStatus, actor = "system", source: ConsentSource = "manual"): Promise<ConsentRecord> {
  return recordConsent({ channel, handle, status, source, note: status === "opted_out" ? "Opt-out (STOP) recorded" : null }, actor);
}

export interface NewOutreach {
  channel: OutreachChannel;
  leadId?: string | null;
  campaignId?: string | null;
  accountId?: string | null;
  toName: string;
  toHandle: string;
  body: string;
  source?: "ai" | "rules" | "manual";
  profileUrl?: string | null;
  rationale?: string | null;
}

/** Queue a new outreach message. SMS with no opt-in is parked in `needs_consent` from birth. */
export async function addOutreach(input: NewOutreach, actor = "system"): Promise<OutreachMessage> {
  const channel = input.channel;
  const toHandle = normalizeHandle(channel, input.toHandle);
  let status: OutreachStatus = "draft";
  let consentId: string | null = null;
  if (channel === "sms") {
    const c = findConsent(db().consent, "sms", toHandle);
    if (c && c.status === "opted_in") consentId = c.id;
    else status = "needs_consent";
  }
  const now = new Date().toISOString();
  const msg: OutreachMessage = {
    id: `om_${crypto.randomUUID().slice(0, 13)}`,
    channel, leadId: input.leadId ?? null, campaignId: input.campaignId ?? null,
    accountId: input.accountId ?? defaultAccountFor(channel)?.id ?? null,
    toName: input.toName, toHandle, body: input.body, status, source: input.source ?? "manual",
    consentId, profileUrl: input.profileUrl ?? null, rationale: input.rationale ?? null,
    createdAt: now, scheduledAt: null, sentAt: null, approvedBy: null, sentBy: null, note: null,
  };
  db().outreach.unshift(msg);
  await liveUpsert("outreach_messages", outreachRow(msg));
  await pushAudit(actor, "outreach.drafted", "outreach", msg.id, { channel, to: msg.toName, status });
  return msg;
}

export async function updateOutreachBody(id: string, body: string, actor = "system"): Promise<OutreachMessage | null> {
  const m = getOutreachMessage(id);
  if (!m) return null;
  m.body = body;
  await liveUpdate("outreach_messages", id, { body });
  await pushAudit(actor, "outreach.edited", "outreach", id, {});
  return m;
}

/** Mark a draft approved/ready. SMS re-checks consent so an opted-out contact can't be queued. */
export async function approveOutreach(id: string, actor: string): Promise<{ ok: boolean; msg?: OutreachMessage; error?: string }> {
  const m = getOutreachMessage(id);
  if (!m) return { ok: false, error: "Message not found." };
  if (m.channel === "sms") {
    const gate = sendGate("sms", db().consent, m.toHandle, (m.accountId ? getChannelAccount(m.accountId) : null) ?? defaultAccountFor("sms") ?? null);
    if (!gate.ok && (gate.reason === "no_consent" || gate.reason === "opted_out")) {
      m.status = "needs_consent";
      await liveUpdate("outreach_messages", id, { status: m.status });
      return { ok: false, error: GATE_REASONS[gate.reason] };
    }
  }
  m.status = "approved";
  m.approvedBy = actor;
  await liveUpdate("outreach_messages", id, { status: m.status, approved_by: actor });
  await pushAudit(actor, "outreach.approved", "outreach", id, { channel: m.channel });
  return { ok: true, msg: m };
}

/**
 * THE send chokepoint. SMS runs the consent gate (legal); every channel runs the daily-cap +
 * active-account check (durability). For social this is invoked when the human clicks "sent".
 */
export async function sendOutreach(id: string, actor: string): Promise<{ ok: boolean; msg?: OutreachMessage; error?: string }> {
  const m = getOutreachMessage(id);
  if (!m) return { ok: false, error: "Message not found." };
  if (m.status === "sent") return { ok: true, msg: m };
  // Re-resolve to the channel default if the pinned account is gone (e.g. it was removed).
  const account = (m.accountId ? getChannelAccount(m.accountId) : null) ?? defaultAccountFor(m.channel) ?? null;
  const gate = sendGate(m.channel, db().consent, m.toHandle, account);
  if (!gate.ok) {
    // A consent failure re-parks an SMS so the queue reflects reality; cap/account failures just report.
    if (m.channel === "sms" && (gate.reason === "no_consent" || gate.reason === "opted_out") && m.status !== "needs_consent") {
      m.status = "needs_consent";
      await liveUpdate("outreach_messages", id, { status: m.status });
    }
    return { ok: false, error: GATE_REASONS[gate.reason] };
  }
  // CLAIM before the wire: conditionally flip the row to "sent" only while it's still in the
  // state this request saw. Two concurrent invocations (double-click, second tab, retry after
  // a blip) race on this DB update — the loser matches zero rows and bails, so the same person
  // can't be texted twice. Claiming BEFORE the provider call also survives a failed status
  // write AFTER Twilio accepted (the old ordering re-sent on retry because the DB still said
  // "approved"). On provider failure the row is moved to "failed" below (retryable).
  if (LIVE) {
    const { data: won, error: claimErr } = await supabaseAdmin()
      .from("outreach_messages")
      .update({ status: "sent" })
      .eq("id", id)
      .eq("status", m.status)
      .select("id");
    if (claimErr) throw new Error(`outreach_messages claim failed: ${claimErr.message}`);
    if (!won?.length) return { ok: false, error: "Already being sent elsewhere — refresh." };
  }
  // SMS goes on the wire via Twilio when configured (gate already passed). Social is human-sent,
  // and without Twilio keys SMS is simulated (demo) — both just mark sent below.
  let providerSid: string | null = null;
  if (m.channel === "sms" && integrations.twilio) {
    const res = await sendSms({ to: m.toHandle, body: m.body, from: account?.identifier });
    if (!res.ok) {
      // A provider rejection must NOT mark sent or burn cap — surface it and leave it retryable.
      m.status = "failed";
      await liveUpdate("outreach_messages", id, { status: m.status });
      await pushAudit(actor, "outreach.failed", "outreach", id, { channel: "sms", to: m.toName, error: res.reason ?? null, code: res.code ?? null });
      return { ok: false, error: res.reason ? `Twilio: ${res.reason}` : "SMS send failed." };
    }
    providerSid = res.sid ?? null;
  }
  m.status = "sent";
  m.sentAt = new Date().toISOString();
  m.sentBy = actor;
  if (m.channel === "sms" && !m.consentId) m.consentId = findConsent(db().consent, "sms", m.toHandle)?.id ?? null;
  await liveUpdate("outreach_messages", id, { status: m.status, sent_at: m.sentAt, sent_by: actor, consent_id: m.consentId });
  if (account) {
    account.sentToday += 1;
    await liveUpdate("channel_accounts", account.id, { sent_today: account.sentToday });
  }
  await pushAudit(actor, "outreach.sent", "outreach", id, { channel: m.channel, to: m.toName, ...(providerSid ? { provider: "twilio", sid: providerSid } : {}) });
  return { ok: true, msg: m };
}

export async function skipOutreach(id: string, actor: string): Promise<OutreachMessage | null> {
  const m = getOutreachMessage(id);
  if (!m) return null;
  m.status = "skipped";
  await liveUpdate("outreach_messages", id, { status: "skipped" });
  await pushAudit(actor, "outreach.skipped", "outreach", id, {});
  return m;
}

/** Capacity snapshot for a channel — used by the UI to show "N of cap left today". */
export function channelCapacity(channel: OutreachChannel): { cap: number; sentToday: number; remaining: number } {
  const accts = db().channelAccounts.filter((a) => a.channel === channel);
  const cap = accts.reduce((s, a) => s + a.dailyCap, 0);
  const sentToday = accts.reduce((s, a) => s + a.sentToday, 0);
  const remaining = accts.reduce((s, a) => s + capRemaining(a), 0);
  return { cap, sentToday, remaining };
}

function channelAccountRow(a: ChannelAccount): Record<string, unknown> {
  return {
    id: a.id, channel: a.channel, label: a.label, identifier: a.identifier, status: a.status,
    daily_cap: a.dailyCap, sent_today: a.sentToday, ten_dlc: a.tenDlc, provider: a.provider, note: a.note,
  };
}

export interface NewChannelAccount {
  channel: OutreachChannel;
  label: string;
  identifier: string;
  dailyCap: number;
  status?: ChannelAccountStatus;
  tenDlc?: TenDlcStatus;
  provider?: string;
  note?: string | null;
}

/** Register a sending identity (an SMS number / a social account) so a channel can send. */
export async function addChannelAccount(input: NewChannelAccount, actor = "system"): Promise<ChannelAccount> {
  const account: ChannelAccount = {
    id: `ca_${crypto.randomUUID().slice(0, 13)}`,
    channel: input.channel,
    label: input.label,
    identifier: input.identifier,
    status: input.status ?? "active",
    dailyCap: input.dailyCap,
    sentToday: 0,
    tenDlc: input.channel === "sms" ? input.tenDlc ?? "pending" : "n/a",
    provider: input.provider ?? (input.channel === "sms" ? "twilio" : input.channel),
    note: input.note ?? null,
  };
  db().channelAccounts.push(account);
  await liveUpsert("channel_accounts", channelAccountRow(account));
  await pushAudit(actor, "channel_account.added", "channel_account", account.id, { channel: account.channel, label: account.label });
  return account;
}

/** Edit a sending account (cap, status, 10DLC, label, note). Cannot change sentToday here. */
export async function updateChannelAccount(
  id: string,
  patch: Partial<Pick<ChannelAccount, "label" | "identifier" | "dailyCap" | "status" | "tenDlc" | "provider" | "note">>,
  actor = "system",
): Promise<ChannelAccount | null> {
  const a = db().channelAccounts.find((x) => x.id === id);
  if (!a) return null;
  if (patch.label !== undefined) a.label = patch.label;
  if (patch.identifier !== undefined) a.identifier = patch.identifier;
  if (patch.dailyCap !== undefined) a.dailyCap = patch.dailyCap;
  if (patch.status !== undefined) a.status = patch.status;
  if (patch.tenDlc !== undefined) a.tenDlc = a.channel === "sms" ? patch.tenDlc : "n/a";
  if (patch.provider !== undefined) a.provider = patch.provider;
  if (patch.note !== undefined) a.note = patch.note;
  await liveUpsert("channel_accounts", channelAccountRow(a));
  await pushAudit(actor, "channel_account.updated", "channel_account", a.id, { ...patch });
  return a;
}

/** Remove a sending account. Queued messages keep their (now-dangling) accountId and re-resolve to the channel default at send. */
export async function removeChannelAccount(id: string, actor = "system"): Promise<boolean> {
  const before = db().channelAccounts.length;
  db().channelAccounts = db().channelAccounts.filter((a) => a.id !== id);
  if (db().channelAccounts.length === before) return false;
  await liveDeleteRow("channel_accounts", id);
  await pushAudit(actor, "channel_account.removed", "channel_account", id, {});
  return true;
}

// --- landing pages (auto-generated per-vertical microsites) -----------------
export const getLandingPages = () => db().landingPages;
export const getLandingPage = (campaignId: string) => db().landingPages.find((p) => p.campaignId === campaignId) ?? null;

function landingRow(p: LandingPage): Record<string, unknown> {
  return {
    id: p.id, campaign_id: p.campaignId, vertical: p.vertical, domain: p.domain, status: p.status,
    content: p.content, scheduler_url: p.schedulerUrl, video_url: p.videoUrl, published_url: p.publishedUrl,
    source: p.source, created_at: p.createdAt, updated_at: p.updatedAt, approved_by: p.approvedBy,
    approved_at: p.approvedAt, published_at: p.publishedAt, note: p.note,
  };
}

/** Generate (or regenerate) a campaign's landing-page copy from its vertical + sequence. Always lands in draft (needs sign-off); preserves any domain/scheduler/video config. */
export async function generateLandingPage(campaignId: string, actor = "system"): Promise<LandingPage | null> {
  const c = getCampaign(campaignId);
  if (!c) return null;
  const firstBody = getVariants().filter((v) => v.campaignId === campaignId).sort((a, b) => a.step - b.step)[0]?.body ?? "";
  const lines = firstBody.replace(/\{\{[^}]+\}\}/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const problem = lines.find((l) => l.length > 40); // first substantive line = the pain to lead with
  const content = await generateLandingContent({ vertical: c.vertical, problem, brief: c.name });
  const now = new Date().toISOString();
  const existing = getLandingPage(campaignId);
  const page: LandingPage = {
    id: existing?.id ?? `lp_${crypto.randomUUID().slice(0, 13)}`,
    campaignId,
    vertical: c.vertical,
    domain: existing?.domain ?? null,
    status: "draft",
    content,
    schedulerUrl: existing?.schedulerUrl ?? appConfig.landing.schedulerUrl,
    videoUrl: existing?.videoUrl ?? appConfig.landing.videoUrl,
    publishedUrl: existing?.publishedUrl ?? null,
    source: content.source,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    approvedBy: null,
    approvedAt: null,
    publishedAt: existing?.publishedAt ?? null,
    note: existing?.note ?? null,
  };
  const i = db().landingPages.findIndex((p) => p.campaignId === campaignId);
  if (i >= 0) db().landingPages[i] = page;
  else db().landingPages.unshift(page);
  await liveUpsert("landing_pages", landingRow(page));
  await pushAudit(actor, "landing.generated", "landing_page", page.id, { campaignId, vertical: c.vertical, source: content.source });
  return page;
}

/** Save operator-edited copy. Edited copy drops back to draft (re-sign-off required). */
export async function updateLandingContent(campaignId: string, content: LandingContent, actor = "system"): Promise<LandingPage | null> {
  const p = getLandingPage(campaignId);
  if (!p) return null;
  p.content = content;
  p.status = "draft";
  p.approvedBy = null;
  p.approvedAt = null;
  p.updatedAt = new Date().toISOString();
  await liveUpdate("landing_pages", p.id, { content: p.content, status: p.status, approved_by: null, approved_at: null, updated_at: p.updatedAt });
  await pushAudit(actor, "landing.edited", "landing_page", p.id, { campaignId });
  return p;
}

/** Sign off on the page — ready to publish (Phase 2 does the actual hosting). */
export async function approveLandingPage(campaignId: string, actor: string): Promise<LandingPage | null> {
  const p = getLandingPage(campaignId);
  if (!p) return null;
  p.status = "approved";
  p.approvedBy = actor;
  p.approvedAt = new Date().toISOString();
  p.updatedAt = p.approvedAt;
  await liveUpdate("landing_pages", p.id, { status: p.status, approved_by: actor, approved_at: p.approvedAt, updated_at: p.updatedAt });
  await pushAudit(actor, "landing.approved", "landing_page", p.id, { campaignId });
  return p;
}

/** Set the page's domain + scheduler/video config (config values, not generated). */
export async function setLandingConfig(
  campaignId: string,
  cfg: { domain?: string | null; schedulerUrl?: string | null; videoUrl?: string | null },
  actor = "system",
): Promise<LandingPage | null> {
  const p = getLandingPage(campaignId);
  if (!p) return null;
  if (cfg.domain !== undefined) p.domain = cfg.domain;
  if (cfg.schedulerUrl !== undefined) p.schedulerUrl = cfg.schedulerUrl;
  if (cfg.videoUrl !== undefined) p.videoUrl = cfg.videoUrl;
  p.updatedAt = new Date().toISOString();
  await liveUpdate("landing_pages", p.id, { domain: p.domain, scheduler_url: p.schedulerUrl, video_url: p.videoUrl, updated_at: p.updatedAt });
  await pushAudit(actor, "landing.config", "landing_page", p.id, { ...cfg });
  return p;
}
