/**
 * Instantly.ai v2 client — sending, replies (unibox), inbox/warmup health.
 * Base: https://api.instantly.ai/api/v2  Header: Authorization: Bearer <key>
 *
 * Canonical for sending + replies + inbox health (we do NOT reimplement these).
 * Verified realities from the brief are encoded as comments where relevant.
 */
import { integrations } from "@/lib/config";
import { httpJson, NotConfiguredError } from "./http";

const BASE = "https://api.instantly.ai/api/v2";

function headers() {
  if (!integrations.instantly) throw new NotConfiguredError("instantly");
  return { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`, "content-type": "application/json" };
}

export interface InstantlyAccount {
  email: string;
  first_name?: string;
  last_name?: string;
  warmup_status?: number | string;
  stat_warmup_score?: number;
  status?: number | string;
  setup_pending?: boolean;
}

/** GET /accounts — one page of inboxes incl. warmup score/status. */
export async function listAccounts(): Promise<InstantlyAccount[]> {
  const data = await httpJson<{ items?: InstantlyAccount[] }>("instantly", `${BASE}/accounts?limit=100`, { headers: headers() });
  return data.items ?? [];
}

/** GET /accounts with cursor pagination — every inbox across the org. */
export async function listAllAccounts(): Promise<InstantlyAccount[]> {
  const out: InstantlyAccount[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 25; i++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("starting_after", cursor);
    const data = await httpJson<{ items?: InstantlyAccount[]; next_starting_after?: string }>(
      "instantly",
      `${BASE}/accounts?${qs}`,
      { headers: headers() },
    );
    const items = data.items ?? [];
    out.push(...items);
    if (!data.next_starting_after || items.length === 0) break;
    cursor = data.next_starting_after;
  }
  return out;
}

/** GET /campaigns. */
export async function listCampaigns(): Promise<unknown[]> {
  const data = await httpJson<{ items?: unknown[] }>("instantly", `${BASE}/campaigns`, { headers: headers() });
  return data.items ?? [];
}

/**
 * GET /emails — the unibox (replies). This is our primary reply source: pull
 * here on a schedule (or via webhook) and reconcile to leads.
 */
export async function listEmails(params: Record<string, string> = {}): Promise<unknown[]> {
  const qs = new URLSearchParams(params).toString();
  const data = await httpJson<{ items?: unknown[] }>("instantly", `${BASE}/emails?${qs}`, { headers: headers() });
  return data.items ?? [];
}

/**
 * POST /campaigns. NOTE: campaign_schedule.schedules[].timezone must be a valid
 * Instantly enum — "America/New_York" was REJECTED in testing. Fetch the allowed
 * list and map before creating.
 */
export async function createCampaign(payload: unknown): Promise<unknown> {
  return httpJson("instantly", `${BASE}/campaigns`, { method: "POST", headers: headers(), body: JSON.stringify(payload) });
}

/** Add an address/domain to Instantly's sending-layer blocklist (suppression). */
export async function addToBlocklist(entries: string[]): Promise<unknown> {
  return httpJson("instantly", `${BASE}/blocklist`, { method: "POST", headers: headers(), body: JSON.stringify({ entries }) });
}

/** Pause a campaign (deliverability auto-pause / operator control). */
export async function pauseCampaign(id: string): Promise<unknown> {
  return httpJson("instantly", `${BASE}/campaigns/${id}/pause`, { method: "POST", headers: headers() });
}
