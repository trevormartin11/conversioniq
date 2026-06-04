/**
 * Data-access layer.
 *
 * In MOCK mode (no Supabase keys) this serves a single mutable in-memory
 * dataset built from the seed — good enough to browse, demo, and exercise every
 * action (approvals persist for the life of the server process). When Supabase
 * keys are present, swap the bodies here for real queries; every page and action
 * goes through these functions, so the rest of the app doesn't change.
 */

import { DATA_MODE } from "@/lib/config";
import type {
  AutomationLevel,
  CreditSpendRequest,
  Dataset,
  Reply,
  ReplyStatus,
  SuppressionEntry,
} from "./types";
import { buildSeed } from "./seed";

// --- singleton --------------------------------------------------------------
let _data: Dataset | null = null;
let _automationLevel: AutomationLevel = "approve_all";

function db(): Dataset {
  if (!_data) _data = buildSeed();
  return _data;
}

export function dataMode() {
  return DATA_MODE;
}

// --- raw getters ------------------------------------------------------------
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
export const getAlerts = () => db().alerts;

export const getReply = (id: string) => db().replies.find((r) => r.id === id) ?? null;
export const getLead = (id: string) => db().leads.find((l) => l.id === id) ?? null;
export const getCampaign = (id: string) => db().campaigns.find((c) => c.id === id) ?? null;
export const getInbox = (id: string) => db().inboxes.find((i) => i.id === id) ?? null;

// --- automation dial --------------------------------------------------------
export const getAutomationLevel = () => _automationLevel;
export function setAutomationLevel(level: AutomationLevel) {
  _automationLevel = level;
  pushAudit("system", "automation.level_changed", "settings", null, { level });
  return _automationLevel;
}

// --- audit helper -----------------------------------------------------------
export function pushAudit(
  actor: string,
  action: string,
  entity: string,
  entityId: string | null,
  meta: Record<string, unknown> = {},
) {
  db().audit.unshift({
    id: `a_${Math.random().toString(36).slice(2, 9)}`,
    actor,
    action,
    entity,
    entityId,
    meta,
    createdAt: new Date().toISOString(),
  });
}

// --- reply mutations --------------------------------------------------------
export function updateReplyStatus(id: string, status: ReplyStatus, actor: string): Reply | null {
  const reply = getReply(id);
  if (!reply) return null;
  reply.status = status;
  reply.handledBy = actor;
  reply.handledAt = new Date().toISOString();
  pushAudit(actor, `reply.${status}`, "reply", id, { lead: reply.fromName });
  return reply;
}

export function saveReplyDraft(id: string, draft: string): Reply | null {
  const reply = getReply(id);
  if (!reply) return null;
  reply.aiDraft = draft;
  return reply;
}

// --- suppression: the global universe enforced at LOAD time -----------------
function norm(s: string) {
  return s.trim().toLowerCase();
}

/** Is this email or its domain already in the contacted + DNC universe? */
export function isSuppressed(email: string): { suppressed: boolean; entry?: SuppressionEntry } {
  const e = norm(email);
  const domain = e.split("@")[1] ?? "";
  const entry = db().suppression.find(
    (s) => (s.email && norm(s.email) === e) || (s.domain && norm(s.domain) === domain),
  );
  return { suppressed: !!entry, entry };
}

/**
 * Dedupe a candidate list against the ENTIRE suppression universe BEFORE anyone
 * enters a campaign — the "don't get caught in a later net" requirement. Returns
 * the clean list plus the rejects with reasons.
 */
export function dedupeAgainstUniverse(
  candidates: { email: string; [k: string]: unknown }[],
): {
  clean: typeof candidates;
  rejected: { email: string; reason: string }[];
} {
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
    if (suppressed) {
      rejected.push({ email: c.email, reason: entry?.reason ?? "suppressed" });
    } else {
      clean.push(c);
    }
  }
  return { clean, rejected };
}

export function addSuppression(entry: Omit<SuppressionEntry, "id" | "createdAt">, actor = "system") {
  const row: SuppressionEntry = {
    ...entry,
    id: `sup_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
  };
  db().suppression.unshift(row);
  pushAudit(actor, "lead.suppressed", "suppression", row.id, { reason: row.reason, email: row.email });
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
      (s) => (s.email?.toLowerCase().includes(q)) || (s.domain?.toLowerCase().includes(q)),
    ).slice(0, 50),
  };
}

// --- credit guard (CIQ spend is gated — hard rule) --------------------------
export function decideCreditRequest(
  id: string,
  decision: "approved" | "denied",
  actor: string,
): CreditSpendRequest | null {
  const req = db().creditRequests.find((r) => r.id === id);
  if (!req) return null;
  req.status = decision;
  req.decidedBy = actor;
  req.decidedAt = new Date().toISOString();
  pushAudit(actor, `credit.${decision}`, "apollo_ciq", id, { amount: req.amount });
  return req;
}

export function createCreditRequest(
  input: Pick<CreditSpendRequest, "provider" | "amount" | "reason" | "requestedBy">,
): CreditSpendRequest {
  const req: CreditSpendRequest = {
    ...input,
    id: `cr_${Math.random().toString(36).slice(2, 9)}`,
    status: "pending",
    decidedBy: null,
    createdAt: new Date().toISOString(),
    decidedAt: null,
  };
  db().creditRequests.unshift(req);
  pushAudit(input.requestedBy, "credit.spend_requested", input.provider, req.id, { amount: input.amount });
  return req;
}

// --- deliverability ---------------------------------------------------------
export function pauseInbox(id: string, actor: string, reason: string) {
  const inbox = getInbox(id);
  if (!inbox) return null;
  inbox.status = "paused";
  pushAudit(actor, "inbox.paused", "inbox", id, { reason });
  return inbox;
}
