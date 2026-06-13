/**
 * Instantly.ai v2 client — sending, replies (unibox), inbox/warmup health.
 * Base: https://api.instantly.ai/api/v2  Header: Authorization: Bearer <key>
 *
 * Canonical for sending + replies + inbox health (we do NOT reimplement these).
 * Verified realities from the brief are encoded as comments where relevant.
 */
import { integrations } from "@/lib/config";
import { httpJson, NotConfiguredError } from "./http";
import { stripHtml } from "@/lib/utils";
import { OPTIMAL_DAYS } from "@/lib/send-timing";

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

export interface InstantlyCampaign {
  id: string;
  name?: string;
  status?: number;
  daily_limit?: number;
  sequences?: unknown;
  email_list?: string[];
}

/** GET /campaigns with cursor pagination. */
export async function listAllCampaigns(): Promise<InstantlyCampaign[]> {
  const out: InstantlyCampaign[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 25; i++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("starting_after", cursor);
    const data = await httpJson<{ items?: InstantlyCampaign[]; next_starting_after?: string }>("instantly", `${BASE}/campaigns?${qs}`, { headers: headers() });
    const items = data.items ?? [];
    out.push(...items);
    if (!data.next_starting_after || items.length === 0) break;
    cursor = data.next_starting_after;
  }
  return out;
}

export interface InstantlyEmail {
  id: string;
  eaccount?: string;
  from_address_email?: string;
  subject?: string;
  body?: { html?: string; text?: string } | string;
  campaign_id?: string;
  lead_id?: string;
  timestamp_email?: string;
  thread_id?: string;
  message_id?: string;
  ue_type?: number;
}

/** GET /emails — the unibox, cursor-paginated. Includes sent + received. */
export async function listAllEmails(max = 1000): Promise<InstantlyEmail[]> {
  const out: InstantlyEmail[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 25 && out.length < max; i++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("starting_after", cursor);
    const data = await httpJson<{ items?: InstantlyEmail[]; next_starting_after?: string }>("instantly", `${BASE}/emails?${qs}`, { headers: headers() });
    const items = data.items ?? [];
    out.push(...items);
    if (!data.next_starting_after || items.length === 0) break;
    cursor = data.next_starting_after;
  }
  return out;
}

/** GET /campaigns/analytics/steps — per-step, per-variant counters for ONE campaign. This is
 *  the data pipe for subject A/B learning; tolerant of shape drift (array or {items}), and a
 *  missing/unsupported endpoint just returns [] so the variant-metrics sync degrades quietly. */
export async function getCampaignStepAnalytics(campaignId: string): Promise<Record<string, unknown>[]> {
  try {
    const data = await httpJson<Record<string, unknown>[] | { items?: Record<string, unknown>[] }>(
      "instantly",
      `${BASE}/campaigns/analytics/steps?campaign_id=${encodeURIComponent(campaignId)}`,
      { headers: headers() },
    );
    return Array.isArray(data) ? data : data.items ?? [];
  } catch {
    return [];
  }
}

/** GET /campaigns/analytics — per-campaign totals (sent/opens/replies). */
export async function getCampaignAnalytics(): Promise<Record<string, unknown>[]> {
  const data = await httpJson<Record<string, unknown>[] | { items?: Record<string, unknown>[] }>("instantly", `${BASE}/campaigns/analytics`, { headers: headers() });
  return Array.isArray(data) ? data : data.items ?? [];
}

/**
 * POST /campaigns. NOTE: campaign_schedule.schedules[].timezone must be a valid
 * Instantly enum — "America/New_York" was REJECTED in testing.
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
  // body "{}" is required: headers() sets content-type: application/json, and Instantly
  // 400s a body-less POST carrying that header ("Body cannot be empty…") — which silently
  // broke Launch AND Pause (incl. the deliverability auto-pause) in live mode.
  return httpJson("instantly", `${BASE}/campaigns/${id}/pause`, { method: "POST", headers: headers(), body: "{}" });
}

/** Activate (launch / resume) a campaign. */
export async function activateCampaign(id: string): Promise<unknown> {
  return httpJson("instantly", `${BASE}/campaigns/${id}/activate`, { method: "POST", headers: headers(), body: "{}" });
}

// --- full campaign detail (sequence + cadence), for the control page --------

interface RawStep { delay?: number; variants?: { subject?: string; body?: string }[] }
interface RawCampaignDetail {
  id?: string; name?: string; status?: number; daily_limit?: number;
  email_list?: string[]; sequences?: { steps?: RawStep[] }[];
}

export interface InstantlyStepView {
  step: number;
  delay: number; // days to wait before this step
  cumulativeDay: number; // day-of-sequence this step lands on
  variants: { variant: string; subject: string; body: string }[];
}
export interface InstantlyCampaignView {
  id: string;
  name: string;
  status: number;
  dailyLimit: number;
  inboxCount: number;
  steps: InstantlyStepView[];
}

/** GET /campaigns/{id} — full pre-staged sequence with cadence + sending inboxes. */
export async function getInstantlyCampaign(id: string): Promise<InstantlyCampaignView | null> {
  const d = await httpJson<RawCampaignDetail>("instantly", `${BASE}/campaigns/${id}`, { headers: headers() });
  if (!d?.id) return null;
  const raw = d.sequences?.[0]?.steps ?? [];
  let cum = 0;
  const steps: InstantlyStepView[] = raw.map((s, i) => {
    const delay = Number(s.delay ?? 0);
    cum += delay;
    return {
      step: i + 1,
      delay,
      cumulativeDay: cum,
      variants: (s.variants ?? []).map((v, vi) => ({
        variant: String.fromCharCode(65 + vi),
        subject: v.subject ?? "",
        body: stripHtml(v.body ?? ""),
      })),
    };
  });
  return {
    id: d.id, name: d.name ?? "", status: d.status ?? 0,
    dailyLimit: d.daily_limit ?? 0, inboxCount: (d.email_list ?? []).length, steps,
  };
}

/** Plain text (with \n) -> the simple HTML Instantly stores for a step body. */
function textToHtml(t: string): string {
  return t
    .split(/\n{2,}/)
    .map((p) => `<div>${p.replace(/\n/g, "<br />")}</div>`)
    .join("<div><br /></div>");
}

/**
 * Create a campaign in Instantly from a drafted sequence. Created as a DRAFT
 * (we never auto-activate) — the operator launches it from the control page.
 * Schedule mirrors a known-good shape (America/Chicago is accepted; New_York was not).
 */
export async function createInstantlyCampaign(input: {
  name: string;
  steps: { subject: string; body: string }[];
  inboxEmails: string[];
  dailyLimit: number;
}): Promise<{ id: string }> {
  const DELAYS = [0, 3, 4, 4, 5, 5]; // days to wait before each step (step 1 sends first)
  const seqSteps = input.steps.map((s, i) => ({
    type: "email",
    delay: DELAYS[i] ?? 4,
    variants: [{ subject: s.subject, body: textToHtml(s.body) }],
  }));
  const payload = {
    name: input.name,
    email_list: input.inboxEmails,
    daily_limit: input.dailyLimit,
    campaign_schedule: {
      schedules: [{
        name: "optimal",
        timing: { from: "08:00", to: "17:00" },
        days: OPTIMAL_DAYS, // mid-week only (Tue/Wed/Thu) — the day-of-week guarantee; step delays are just min spacing
        timezone: "America/Chicago",
      }],
    },
    sequences: [{ steps: seqSteps }],
  };
  const res = await httpJson<{ id?: string }>("instantly", `${BASE}/campaigns`, {
    method: "POST", headers: headers(), body: JSON.stringify(payload),
  });
  return { id: res.id ?? "" };
}

/** Delete a campaign (cleanup / operator control). DELETE must NOT carry a JSON content-type
 *  with no body — Instantly 400s ("empty json body") — so send an auth-only header. */
export async function deleteInstantlyCampaign(id: string): Promise<unknown> {
  if (!integrations.instantly) throw new NotConfiguredError("instantly");
  return httpJson("instantly", `${BASE}/campaigns/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
  });
}

/** Best-effort: are leads loaded into this campaign? (presence, not exact count) */
export async function campaignHasLeads(id: string): Promise<boolean> {
  const d = await httpJson<{ items?: unknown[] }>("instantly", `${BASE}/leads/list`, {
    method: "POST", headers: headers(), body: JSON.stringify({ campaign: id, limit: 1 }),
  });
  return (d.items?.length ?? 0) > 0;
}

export interface NewInstantlyLead {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  phone?: string;
  /** Per-lead hyper-personalization line — fills the {{personalization}} merge tag in the sequence. */
  personalization?: string;
}

/**
 * Load leads into a campaign. Instantly v2 creates one lead per POST /leads with the
 * target `campaign` id; we go sequentially (tolerant of per-lead failures) and report
 * how many landed. NB: for large batches this should move to a background job.
 */
export async function addLeadsToCampaign(campaignId: string, leads: NewInstantlyLead[]): Promise<{ added: number; failed: number }> {
  let added = 0;
  let failed = 0;
  for (const lead of leads) {
    const { personalization, ...rest } = lead;
    const body: Record<string, unknown> = { campaign: campaignId, ...rest };
    // Personalization rides as a custom variable → {{personalization}} in the sequence copy.
    if (personalization) body.custom_variables = { personalization };
    try {
      await httpJson("instantly", `${BASE}/leads`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });
      added++;
    } catch {
      failed++;
    }
  }
  return { added, failed };
}

/**
 * Reply to a received email on its original thread (the unibox send path).
 * v2: POST /emails/reply with the source email's id as reply_to_uuid. Wire shape to be
 * confirmed against live docs on the first real send — the action only marks a reply
 * "sent" if this call succeeds, so a wrong shape fails safe rather than faking a send.
 */
export async function replyToEmail(input: { replyToUuid: string; eaccount: string; subject: string; bodyText: string }): Promise<unknown> {
  return httpJson("instantly", `${BASE}/emails/reply`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      reply_to_uuid: input.replyToUuid,
      eaccount: input.eaccount,
      subject: input.subject,
      body: { text: input.bodyText, html: input.bodyText.replace(/\n/g, "<br />") },
    }),
  });
}

/**
 * Push edited copy to a LIVE campaign's sequence (PATCH /campaigns/{id}). Preserves each
 * step's existing delay (cadence untouched) and only swaps in the new subjects/bodies.
 * Fails loud if Instantly rejects the shape — the caller surfaces the error, never fakes it.
 */
export async function updateInstantlyCampaignSequence(id: string, stepsVariants: { subject: string; body: string }[][]): Promise<unknown> {
  let delays: number[] = [];
  try {
    const existing = await httpJson<RawCampaignDetail>("instantly", `${BASE}/campaigns/${id}`, { headers: headers() });
    delays = (existing.sequences?.[0]?.steps ?? []).map((s) => Number(s.delay ?? 0));
  } catch {
    /* no existing delays available — fall back to the default cadence below */
  }
  const DEFAULT_DELAYS = [0, 3, 4, 4, 5, 5];
  const steps = stepsVariants.map((variants, i) => ({
    type: "email",
    delay: delays[i] ?? DEFAULT_DELAYS[i] ?? 4,
    variants: variants.map((v) => ({ subject: v.subject, body: textToHtml(v.body) })),
  }));
  return httpJson("instantly", `${BASE}/campaigns/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ sequences: [{ steps }] }),
  });
}

/**
 * Set a LIVE campaign's sending schedule (PATCH /campaigns/{id}) — the optimal window +
 * days in a given timezone. NB: Instantly's timezone enum is finicky (America/Chicago is
 * known-good; America/New_York was rejected in testing), so callers default to Chicago.
 */
export async function updateInstantlyCampaignSchedule(
  id: string,
  opts: { timezone: string; from: string; to: string; days?: Record<string, boolean> },
): Promise<unknown> {
  return httpJson("instantly", `${BASE}/campaigns/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({
      campaign_schedule: {
        schedules: [{ name: "optimal", timing: { from: opts.from, to: opts.to }, days: opts.days ?? OPTIMAL_DAYS, timezone: opts.timezone }],
      },
    }),
  });
}
