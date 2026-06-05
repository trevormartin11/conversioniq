/**
 * Zoho CRM v6 client — canonical for leads/contacts + Do-Not-Contact.
 * OAuth refresh-token flow: access tokens expire hourly and are minted from the
 * refresh token. Auth header: Authorization: Zoho-oauthtoken <access_token>.
 * GET /crm/v6/Leads REQUIRES a `fields` param.
 */
import { integrations } from "@/lib/config";
import { httpJson, NotConfiguredError } from "./http";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (!integrations.zoho) throw new NotConfiguredError("zoho");
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const accountsUrl = process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.com";
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    grant_type: "refresh_token",
  });
  const data = await httpJson<{ access_token: string; expires_in: number }>(
    "zoho",
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
  return `${process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.com"}/crm/v6`;
}

const DEFAULT_FIELDS = ["Email", "First_Name", "Last_Name", "Company", "Lead_Status", "Phone"];

export async function getLeads(fields: string[] = DEFAULT_FIELDS, page = 1): Promise<unknown[]> {
  const qs = new URLSearchParams({ fields: fields.join(","), page: String(page), per_page: "200" });
  const data = await httpJson<{ data?: unknown[] }>("zoho", `${apiBase()}/Leads?${qs}`, { headers: await authHeaders() });
  return data.data ?? [];
}

export async function createLead(record: Record<string, unknown>): Promise<unknown> {
  return httpJson("zoho", `${apiBase()}/Leads`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ data: [record] }),
  });
}

/** Mark a lead Do-Not-Contact in Zoho (canonical suppression). */
export async function setDoNotContact(leadId: string): Promise<unknown> {
  return httpJson("zoho", `${apiBase()}/Leads`, {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify({ data: [{ id: leadId, Email_Opt_Out: true, Lead_Status: "Do Not Contact" }] }),
  });
}

export async function updateLeadStatus(leadId: string, status: string): Promise<unknown> {
  return httpJson("zoho", `${apiBase()}/Leads`, {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify({ data: [{ id: leadId, Lead_Status: status }] }),
  });
}
