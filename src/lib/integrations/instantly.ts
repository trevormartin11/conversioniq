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
  warmup_status?: number | string;
  status?: string;
}

/** GET /accounts — inboxes incl. warmup_status. */
export async function listAccounts(): Promise<InstantlyAccount[]> {
  const data = await httpJson<{ items?: InstantlyAccount[] }>("instantly", `${BASE}/accounts`, { headers: headers() });
  return data.items ?? [];
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
