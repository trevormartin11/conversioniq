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
    { key: "zoho", label: "Zoho CRM", connected: integrations.zoho, role: "Canonical leads/contacts + Do-Not-Contact" },
    { key: "apolloPersonal", label: "Apollo (Personal)", connected: integrations.apolloPersonal, role: "Search + enrich (free)" },
    { key: "apolloCiq", label: "Apollo (CIQ credits)", connected: integrations.apolloCiq, role: "Paid credits — gated, never auto-spent" },
    { key: "anthropic", label: "Claude (AI)", connected: integrations.anthropic, role: "Reply classification, drafts, copy ideas", note: integrations.anthropic ? undefined : "Rules-based fallback active" },
    { key: "gmail", label: "Gmail", connected: integrations.gmail, role: "Reply fallback source + exports" },
    { key: "telegram", label: "Telegram", connected: integrations.telegram, role: "Hot-reply pings + daily digest" },
  ];
}
