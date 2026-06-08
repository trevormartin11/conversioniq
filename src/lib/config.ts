/**
 * Central configuration + integration availability.
 *
 * The hub is designed to run with ZERO external keys (rich mock/seed data) and
 * to light up each integration independently as its keys arrive. `integrations`
 * tells the rest of the app what's live so the UI can show honest status and the
 * data layer can decide between real calls and seed data.
 */

function has(...vars: (string | undefined)[]): boolean {
  return vars.every((v) => typeof v === "string" && v.trim().length > 0);
}

export const integrations = {
  supabase: has(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  anthropic: has(process.env.ANTHROPIC_API_KEY),
  instantly: has(process.env.INSTANTLY_API_KEY),
  zoho: has(
    process.env.ZOHO_CLIENT_ID,
    process.env.ZOHO_CLIENT_SECRET,
    process.env.ZOHO_REFRESH_TOKEN,
  ),
  // ConversionIQ's Zoho org (the partner side) — its own OAuth app so the two stay separate.
  zohoCiq: has(
    process.env.ZOHO_CIQ_CLIENT_ID,
    process.env.ZOHO_CIQ_CLIENT_SECRET,
    process.env.ZOHO_CIQ_REFRESH_TOKEN,
  ),
  // SMS sending (A2P 10DLC) — the consent-gated warm channel. Off until keyed (sends simulate).
  // Needs creds + a sender: either a From number OR a Messaging Service SID (the 10DLC path).
  twilio:
    has(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) &&
    (has(process.env.TWILIO_FROM_NUMBER) || has(process.env.TWILIO_MESSAGING_SERVICE_SID)),
  apolloPersonal: has(process.env.APOLLO_PERSONAL_API_KEY),
  apolloCiq: has(process.env.APOLLO_CIQ_API_KEY),
  // Lead-sourcing providers — each lights up its lane when its key arrives.
  lusha: has(process.env.LUSHA_API_KEY),
  outscraper: has(process.env.OUTSCRAPER_API_KEY),
  findymail: has(process.env.FINDYMAIL_API_KEY),
  millionverifier: has(process.env.MILLIONVERIFIER_API_KEY),
  // Phase-2 personalization: a pluggable social/LinkedIn-activity provider (off until keyed).
  socialSignals: has(process.env.SOCIAL_SIGNAL_API_KEY, process.env.SOCIAL_SIGNAL_API_URL),
  gmail: has(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REFRESH_TOKEN,
  ),
  telegram: has(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID),
  // DNS provider for the sending domains — powers DMARC/SPF auto-fix.
  namecheap: has(process.env.NAMECHEAP_API_KEY, process.env.NAMECHEAP_USERNAME),
} as const;

export type IntegrationKey = keyof typeof integrations;

/** True when we have a real database; otherwise the app serves seed data. */
export const DATA_MODE: "live" | "mock" = integrations.supabase ? "live" : "mock";

export const appConfig = {
  /** Business model: 20% recurring, split 3 equal ways. */
  residual: {
    grossRate: 0.2,
    splitWays: 3,
    get personalRate() {
      return this.grossRate / this.splitWays; // ~6.67%
    },
  },
  /** North-star targets the whole operation is run against. */
  goals: {
    demosPerDay: 2, // booked demos/day — the number to blow past
    monthlyBudgetUsd: 1000, // hard ceiling on total spend until it self-funds
  },
  /** Forward-projection assumptions — OPERATOR-SET, never inferred from CIQ's data.
   *  Used only for the illustrative pipeline projection; actuals drive real residual. */
  projection: {
    assumedCloseRate: 0.25, // booked demo -> closed account
    assumedMonthlyMrr: 500, // avg MRR per closed account ($)
  },
  /** Deliverability guardrails (existential with ~49 inboxes). */
  deliverability: {
    warmupGate: 80, // block sends from inboxes under this score
    autoPauseBounceRate: 0.05, // 5% bounce -> auto-pause
    autoPauseSpamComplaints: 3,
  },
  /** Lead-sourcing spend guardrails — a hard ceiling no single run may exceed. */
  sourcing: {
    maxRunBudgetUsd: 200,
  },
  /** Default automation posture — operator can move the dial up over time. */
  defaultAutomationLevel: "approve_all" as const,
  /** Which reply classes are auto-SENT at the "auto_safe" level. (OOO is auto-snoozed
   *  separately; negatives/unsubscribes are always auto-suppressed.) */
  autoSafeClasses: ["referral"] as const,
  /** Classes that trigger an immediate Telegram ping rather than the digest. */
  hotClasses: ["interested", "question"] as const,
  /** Premium model — generative, quality-sensitive work (strategy, copy, drafting, personalization). */
  model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
  /** Fast/cheap model — high-frequency, low-complexity work (reply classification runs every 10 min).
   *  This is the main cost lever: classification fires per inbound reply on the sync cron + webhook,
   *  so it stays off the premium tier by default. Falls back to keyword rules if AI is unavailable. */
  fastModel: process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-4-5-20251001",
  /** Claude API spend controls. The soft budget is an alert line for the live meter (NOT a hard cap). */
  ai: {
    softMonthlyBudgetUsd: Number(process.env.AI_SOFT_BUDGET_USD) || 50,
  },
  /** Per-vertical landing-page microsites. Public config (not secrets) — env-overridable defaults
   *  every generated page inherits for its scheduler + features video. */
  landing: {
    schedulerUrl: process.env.LANDING_SCHEDULER_URL || "https://calendly.com/trevor-martin-conversioniq/conversioniq-demo",
    videoUrl: process.env.LANDING_VIDEO_URL || "https://www.youtube.com/watch?v=AYgqHOaLBm0",
  },
} as const;
