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
  apolloPersonal: has(process.env.APOLLO_PERSONAL_API_KEY),
  apolloCiq: has(process.env.APOLLO_CIQ_API_KEY),
  gmail: has(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REFRESH_TOKEN,
  ),
  telegram: has(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID),
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
  /** Deliverability guardrails (existential with ~49 inboxes). */
  deliverability: {
    warmupGate: 80, // block sends from inboxes under this score
    autoPauseBounceRate: 0.05, // 5% bounce -> auto-pause
    autoPauseSpamComplaints: 3,
  },
  /** Default automation posture — operator can move the dial up over time. */
  defaultAutomationLevel: "approve_all" as const,
  /** Which reply classes are eligible for auto-send at the "auto_safe" level. */
  autoSafeClasses: ["ooo", "referral"] as const,
  /** Classes that trigger an immediate Telegram ping rather than the digest. */
  hotClasses: ["interested", "question"] as const,
  model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
} as const;
