/** Aggregated integration status for the settings/automation surfaces. */
import { DATA_MODE, integrations, type IntegrationKey } from "@/lib/config";

export interface IntegrationStatus {
  key: IntegrationKey | "dataMode";
  label: string;
  connected: boolean;
  role: string;
  note?: string;
}

export function integrationStatuses(): IntegrationStatus[] {
  return [
    { key: "supabase", label: "Supabase (Hub DB)", connected: integrations.supabase, role: "Orchestration + analytics + the cross-tool JOIN", note: DATA_MODE === "mock" ? "Running on seed data until connected" : undefined },
    { key: "instantly", label: "Instantly.ai", connected: integrations.instantly, role: "Sending + replies (unibox) + inbox/warmup health" },
    { key: "zoho", label: "Zoho CRM (ours)", connected: integrations.zoho, role: "Canonical leads/contacts + Do-Not-Contact" },
    { key: "zohoCiq", label: "ConversionIQ Zoho (partner)", connected: integrations.zohoCiq, role: "Demo→deal handoff + won/lost outcome webhook" },
    { key: "apolloPersonal", label: "Apollo (Personal)", connected: integrations.apolloPersonal, role: "Search + enrich (free)" },
    { key: "apolloCiq", label: "Apollo (CIQ credits)", connected: integrations.apolloCiq, role: "Paid credits — gated, never auto-spent" },
    { key: "outscraper", label: "Outscraper", connected: integrations.outscraper, role: "Local lead sourcing (Maps) + emails" },
    { key: "millionverifier", label: "MillionVerifier", connected: integrations.millionverifier, role: "Email verification before sending" },
    { key: "lusha", label: "Lusha", connected: integrations.lusha, role: "Contact enrichment (optional lane)" },
    { key: "findymail", label: "Findymail", connected: integrations.findymail, role: "Email finding (optional lane)" },
    { key: "anthropic", label: "Claude (AI)", connected: integrations.anthropic, role: "Reply classification, drafts, copy coach", note: integrations.anthropic ? undefined : "Rules-based fallback active" },
    { key: "gmail", label: "Gmail", connected: integrations.gmail, role: "Demo reminders + transactional sends + reply fallback" },
    { key: "namecheap", label: "Namecheap (DNS)", connected: integrations.namecheap, role: "DMARC / SPF auto-fix for sending domains" },
    { key: "telegram", label: "Telegram", connected: integrations.telegram, role: "Hot-reply pings + daily/weekly digest" },
  ];
}
