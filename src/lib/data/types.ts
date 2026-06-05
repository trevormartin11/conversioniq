/**
 * Domain model for the CIQ Hub.
 *
 * This is the "attribution at source" backbone from the brief: every lead is
 * tagged at creation with the dimensions we need for analytics later
 * (campaign, vertical, persona, sending_domain, list_version, source). Those
 * tags cannot be reconstructed after the fact, so they live on the record.
 */

// ---------------------------------------------------------------------------
// Enums (string-literal unions + value arrays for iteration/validation)
// ---------------------------------------------------------------------------

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "opened",
  "replied",
  "positive",
  "demo_booked",
  "demo_showed",
  "closed",
  "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** AI classification buckets for an inbound reply. */
export const REPLY_CLASSES = [
  "interested",
  "question",
  "objection",
  "not_now",
  "negative",
  "unsubscribe",
  "ooo",
  "referral",
] as const;
export type ReplyClass = (typeof REPLY_CLASSES)[number];

export const REPLY_STATUSES = [
  "pending", // awaiting human approval
  "approved", // approved, queued to send
  "sent", // sent after human approval
  "auto_sent", // sent automatically (automation dial)
  "suppressed", // auto-actioned (unsubscribe/negative) — no reply sent
  "snoozed", // OOO / not-now — rescheduled
  "skipped", // dismissed by operator
] as const;
export type ReplyStatus = (typeof REPLY_STATUSES)[number];

/** The "automation dial": approve everything -> auto-send safe -> auto all. */
export const AUTOMATION_LEVELS = ["approve_all", "auto_safe", "auto_all"] as const;
export type AutomationLevel = (typeof AUTOMATION_LEVELS)[number];

export const SUPPRESSION_REASONS = [
  "contacted",
  "dnc",
  "bounced",
  "unsubscribed",
  "complained",
  "manual",
] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const INBOX_STATUSES = ["active", "warming", "paused", "error"] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export const CAMPAIGN_STATUSES = ["active", "paused", "draft", "completed"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const DEMO_STATUSES = ["booked", "showed", "no_show", "closed", "lost"] as const;
export type DemoStatus = (typeof DEMO_STATUSES)[number];

// Why a demo didn't convert — structured so the learning loop can aggregate it per cell.
export const DEMO_LOST_REASONS = ["not_icp", "no_budget", "no_show", "bad_timing", "competitor", "not_interested", "no_decision", "other"] as const;
export type DemoLostReason = (typeof DEMO_LOST_REASONS)[number];

export const CREDIT_PROVIDERS = ["apollo_personal", "apollo_ciq", "lusha", "outscraper", "findymail", "millionverifier"] as const;
export type CreditProvider = (typeof CREDIT_PROVIDERS)[number];

/** Cost / spend tracking — the operation's P&L inputs. */
export const COST_CATEGORIES = [
  "sending", // Instantly
  "data", // Apollo, lead lists
  "email", // Google Workspace / Gmail
  "domains", // registrations
  "leads", // purchased lead lists
  "software", // warmup tools, misc SaaS
  "other",
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const COST_CADENCES = ["monthly", "annual", "one_time"] as const;
export type CostCadence = (typeof COST_CADENCES)[number];

/** Red / Yellow / Green — the glanceable health signal. */
export type Health = "green" | "yellow" | "red";

export type Role = "owner" | "partner";

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role; // all 3 partners have equal powers today; role reserved for later
  avatarColor: string;
}

export interface Persona {
  id: string;
  name: string; // e.g. "Trevor Martin"
  fromName: string;
  title: string;
  signature: string;
}

export interface Domain {
  id: string;
  domain: string; // e.g. joinconversioniq.com
  personaId: string;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  reputation: Health;
}

export interface Inbox {
  id: string;
  email: string;
  domainId: string;
  personaId: string;
  instantlyAccountId: string | null;
  warmupScore: number; // 0-100; gate sends under ~80
  status: InboxStatus;
  dailyCap: number;
  sentToday: number;
  bounceRate: number; // 0-1
  spamComplaints: number;
  lastSyncedAt: string | null;
}

export interface Campaign {
  id: string;
  name: string;
  vertical: string; // "Med Spa", "Home Services", ...
  personaId: string;
  status: CampaignStatus;
  instantlyCampaignId: string | null;
  listVersion: string;
  inboxIds: string[];
  dailyCap: number;
  createdAt: string;
}

export interface Lead {
  id: string;
  email: string;
  domain: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  phone: string | null;
  // --- attribution, set at source ---
  campaignId: string | null;
  vertical: string;
  persona: string;
  sendingDomain: string;
  listVersion: string;
  source: string; // "apollo", "import", ...
  attributionOwner: string; // which partner owns the cell
  // --- lifecycle ---
  status: LeadStatus;
  zohoLeadId: string | null;
  apolloId: string | null;
  createdAt: string;
  lastContactedAt: string | null;
}

export interface Reply {
  id: string;
  leadId: string;
  campaignId: string | null;
  inboxId: string;
  instantlyEmailId: string | null;
  fromEmail: string;
  fromName: string;
  subject: string;
  body: string;
  receivedAt: string;
  classification: ReplyClass;
  confidence: number; // 0-1 classifier confidence
  aiDraft: string | null;
  draftSource: "ai" | "rules" | null;
  status: ReplyStatus;
  hot: boolean; // ping Telegram immediately vs. batch into digest
  handledBy: string | null;
  handledAt: string | null;
}

export interface SuppressionEntry {
  id: string;
  email: string | null;
  domain: string | null; // domain-level suppression supported
  reason: SuppressionReason;
  source: string;
  leadId: string | null;
  createdAt: string;
  note: string | null;
}

export interface CreditMeter {
  provider: CreditProvider;
  label: string;
  used: number;
  total: number;
  resetsAt: string | null;
  gated: boolean; // CIQ = true (hard rule)
  lastSyncedAt: string | null;
}

export interface CreditSpendRequest {
  id: string;
  provider: CreditProvider;
  amount: number;
  reason: string;
  requestedBy: string;
  status: "pending" | "approved" | "denied" | "executed";
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface JobRun {
  id: string;
  job: string; // "sync_replies", "list_refill", "daily_brief", "weekly_report"
  status: "ok" | "error" | "running";
  lastRunAt: string | null;
  nextRunAt: string | null;
  durationMs: number | null;
  error: string | null;
}

export interface Demo {
  id: string;
  leadId: string;
  scheduledAt: string;
  status: DemoStatus;
  owner: string;
  mrr: number | null; // monthly recurring revenue once won
  outcomeReason: DemoLostReason | null; // why a demo was lost — the training signal
  outcomeNote: string | null; // free-text context from whoever ran the demo (Jon)
  outcomeAt: string | null;
  civDealId: string | null; // the Deal id in ConversionIQ's Zoho pipeline (handoff)
  reminderSentAt: string | null; // no-show defense — last reminder timestamp
}

export interface SequenceVariant {
  id: string;
  campaignId: string;
  step: number;
  variant: string; // "A" | "B" | ...
  subject: string;
  body: string;
  sent: number;
  opens: number;
  replies: number;
  positives: number;
  approved: boolean;
}

export interface DailyMetric {
  date: string; // YYYY-MM-DD
  campaignId: string | null; // null = global
  sends: number;
  opens: number;
  replies: number;
  positives: number;
  bounces: number;
  demos: number;
}

export interface Cost {
  id: string;
  category: CostCategory;
  vendor: string; // "Instantly", "Apollo", "Google Workspace", "Namecheap", ...
  description: string;
  amount: number; // USD
  cadence: CostCadence;
  status: "active" | "cancelled";
  startedAt: string;
  nextChargeAt: string | null;
  source: "manual" | "auto"; // auto = pulled from an integration later
  note: string | null;
  createdBy: string;
}

export interface Alert {
  id: string;
  level: Health; // green=info, yellow=warn, red=urgent
  title: string;
  detail: string;
  createdAt: string;
  source: string;
}

/** The complete in-memory dataset. Mirrors the Supabase tables 1:1. */
export interface Dataset {
  users: User[];
  personas: Persona[];
  domains: Domain[];
  inboxes: Inbox[];
  campaigns: Campaign[];
  leads: Lead[];
  replies: Reply[];
  suppression: SuppressionEntry[];
  creditMeters: CreditMeter[];
  creditRequests: CreditSpendRequest[];
  audit: AuditEvent[];
  jobs: JobRun[];
  demos: Demo[];
  variants: SequenceVariant[];
  metrics: DailyMetric[];
  alerts: Alert[];
  costs: Cost[];
}
