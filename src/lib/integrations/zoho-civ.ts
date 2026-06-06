/**
 * ConversionIQ's Zoho CRM — the partner side of the loop (a SEPARATE org from ours).
 *
 * The moment a demo is booked we write a Deal here at the "Demo Scheduled" stage, and
 * we read the outcome back (won / lost + reason) to train sourcing. Uses its own OAuth
 * app/creds (ZOHO_CIQ_*) so the reseller org and the CIQ org stay cleanly separated.
 *
 * Fail-safe: when CIQ's org isn't wired yet, pushes return a synthetic id and reads
 * return empty — so the local lifecycle and the handoff stay visible in mock mode.
 */
import { integrations } from "@/lib/config";
import { httpJson, NotConfiguredError } from "./http";
import type { Demo, Lead } from "@/lib/data/types";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (!integrations.zohoCiq) throw new NotConfiguredError("zohoCiq");
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const accountsUrl = process.env.ZOHO_CIQ_ACCOUNTS_URL || "https://accounts.zoho.com";
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_CIQ_REFRESH_TOKEN!,
    client_id: process.env.ZOHO_CIQ_CLIENT_ID!,
    client_secret: process.env.ZOHO_CIQ_CLIENT_SECRET!,
    grant_type: "refresh_token",
  });
  const data = await httpJson<{ access_token: string; expires_in: number }>(
    "zohoCiq",
    `${accountsUrl}/oauth/v2/token?${params.toString()}`,
    { method: "POST" },
  );
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

async function authHeaders() {
  return { Authorization: `Zoho-oauthtoken ${await accessToken()}`, "content-type": "application/json" };
}

function apiBase() {
  return `${process.env.ZOHO_CIQ_API_DOMAIN || "https://www.zohoapis.com"}/crm/v6`;
}

/** Stage in CIQ's Deal pipeline a freshly booked demo lands in (override per their pipeline). */
export const CIV_DEMO_STAGE = process.env.ZOHO_CIQ_DEMO_STAGE || "Demo Scheduled";

/**
 * Create a Deal in CIQ's pipeline for a booked demo. Never throws — returns a synthetic
 * id when the CIQ org isn't configured so the booking flow always completes.
 */
export async function pushDemoDeal(lead: Lead, demo: Demo): Promise<{ dealId: string | null; live: boolean }> {
  if (!integrations.zohoCiq) return { dealId: `civmock_${demo.id}`, live: false };
  const record: Record<string, unknown> = {
    Deal_Name: `${lead.company} — ConversionIQ demo`,
    Stage: CIV_DEMO_STAGE,
    Closing_Date: demo.scheduledAt.slice(0, 10),
    Contact_Name: `${lead.firstName} ${lead.lastName}`.trim() || lead.company,
    Email: lead.email,
    Phone: lead.phone ?? undefined,
    Lead_Source: `Reseller — ${lead.attributionOwner}`,
    Description: `Booked from outbound (${lead.vertical} / ${lead.persona}). Demo owner: ${demo.owner}.`,
  };
  if (demo.mrr != null) record.Amount = demo.mrr;
  try {
    const res = await httpJson<{ data?: { details?: { id?: string } }[] }>("zohoCiq", `${apiBase()}/Deals`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ data: [record] }),
    });
    return { dealId: res.data?.[0]?.details?.id ?? null, live: true };
  } catch {
    return { dealId: null, live: true };
  }
}

/**
 * CIQ's existing customers/accounts — pulled into our suppression universe so we never
 * pitch someone already in their funnel. Empty when not configured.
 */
export async function listCivAccounts(fields = ["Account_Name", "Website", "Email"], page = 1): Promise<unknown[]> {
  if (!integrations.zohoCiq) return [];
  const qs = new URLSearchParams({ fields: fields.join(","), page: String(page), per_page: "200" });
  const data = await httpJson<{ data?: unknown[] }>("zohoCiq", `${apiBase()}/Accounts?${qs}`, { headers: await authHeaders() });
  return data.data ?? [];
}

export interface CivDealOutcome {
  stage: string | null;
  amount: number | null;
  lostReason: string | null;
}

/**
 * Read a CIQ Deal's current stage + amount (won MRR) by id — the poll-side complement to
 * the outcome webhook, so a missed webhook still closes the loop. Reads only standard Deal
 * fields (Stage/Amount/Closing_Date) to stay safe across CIQ's custom layout. Returns null
 * when not configured or the deal can't be read.
 */
export async function getCivDealOutcome(dealId: string): Promise<CivDealOutcome | null> {
  if (!integrations.zohoCiq || !dealId) return null;
  const fields = ["Deal_Name", "Stage", "Amount", "Closing_Date"].join(",");
  try {
    const data = await httpJson<{ data?: Record<string, unknown>[] }>(
      "zohoCiq",
      `${apiBase()}/Deals/${encodeURIComponent(dealId)}?fields=${fields}`,
      { headers: await authHeaders() },
    );
    const rec = data.data?.[0];
    if (!rec) return null;
    const amount = rec.Amount == null ? null : Number(rec.Amount);
    return {
      stage: (rec.Stage as string) ?? null,
      amount: Number.isFinite(amount) ? (amount as number) : null,
      lostReason: null, // structured loss reason arrives via the webhook payload, not the record read
    };
  } catch {
    return null;
  }
}
