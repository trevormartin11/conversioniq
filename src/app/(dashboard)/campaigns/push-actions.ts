"use server";

import { ensureData, getCampaign, getInboxes, getLeads, getVariants } from "@/lib/data/store";
import {
  addLeadsToCampaign,
  createInstantlyCampaign,
  updateInstantlyCampaignSchedule,
  updateInstantlyCampaignSequence,
} from "@/lib/integrations/instantly";
import { integrations } from "@/lib/config";
import { INSTANTLY_TZ, TZ_LABEL, bucketByTimezone, leadTimezone, optimalWindowHHMM, type Tz } from "@/lib/send-timing";

/** First variant per step, ordered — the sequence to replicate into Instantly. */
function sequenceFor(campaignId: string): { subject: string; body: string }[] {
  const vars = getVariants().filter((v) => v.campaignId === campaignId);
  const byStep = new Map<number, { subject: string; body: string }>();
  for (const v of [...vars].sort((a, b) => a.step - b.step || a.variant.localeCompare(b.variant))) {
    if (!byStep.has(v.step)) byStep.set(v.step, { subject: v.subject, body: v.body });
  }
  return [...byStep.keys()].sort((a, b) => a - b).map((k) => byStep.get(k)!);
}

/** Push the hub's edited sequence copy to the live Instantly campaign (cadence preserved). */
export async function pushCopyToInstantlyAction(campaignId: string): Promise<{ ok: boolean; error?: string }> {
  await ensureData();
  const c = getCampaign(campaignId);
  if (!c?.instantlyCampaignId) return { ok: false, error: "This campaign isn't linked to an Instantly campaign yet." };
  if (!integrations.instantly) return { ok: false, error: "Instantly isn't connected." };
  const vars = getVariants().filter((v) => v.campaignId === campaignId);
  if (!vars.length) return { ok: false, error: "No sequence copy to push." };

  const byStep = new Map<number, { subject: string; body: string }[]>();
  for (const v of [...vars].sort((a, b) => a.step - b.step || a.variant.localeCompare(b.variant))) {
    const arr = byStep.get(v.step) ?? [];
    arr.push({ subject: v.subject, body: v.body });
    byStep.set(v.step, arr);
  }
  const stepsVariants = [...byStep.keys()].sort((a, b) => a - b).map((k) => byStep.get(k)!);

  try {
    await updateInstantlyCampaignSequence(c.instantlyCampaignId, stepsVariants);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Apply the optimal send window to the live campaign, in the timezone of its dominant lead bucket. */
export async function applyOptimalScheduleAction(campaignId: string): Promise<{ ok: boolean; timezone?: string; error?: string }> {
  await ensureData();
  const c = getCampaign(campaignId);
  if (!c?.instantlyCampaignId) return { ok: false, error: "This campaign isn't linked to an Instantly campaign yet." };
  if (!integrations.instantly) return { ok: false, error: "Instantly isn't connected." };

  const leads = getLeads().filter((l) => l.campaignId === campaignId);
  const dominant = bucketByTimezone(leads)
    .filter((b) => b.tz !== "unknown")
    .sort((a, b) => b.count - a.count)[0]?.tz as Exclude<Tz, "unknown"> | undefined;
  const timezone = dominant ? INSTANTLY_TZ[dominant] : "America/Chicago";
  const { from, to } = optimalWindowHHMM();

  try {
    await updateInstantlyCampaignSchedule(c.instantlyCampaignId, { timezone, from, to });
    return { ok: true, timezone };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface TzSplitPlanRow {
  tz: Tz;
  label: string;
  count: number;
  zone: string;
  window: string;
}

/** Preview the timezone split: how many of this campaign's leads land in each bucket. Read-only. */
export async function previewTimezoneSplitAction(campaignId: string): Promise<{ rows: TzSplitPlanRow[]; unknown: number; hasSequence: boolean }> {
  await ensureData();
  const leads = getLeads().filter((l) => l.campaignId === campaignId);
  const buckets = bucketByTimezone(leads);
  const { from, to } = optimalWindowHHMM();
  const rows = buckets
    .filter((b) => b.tz !== "unknown")
    .map((b) => ({ tz: b.tz, label: b.label, count: b.count, zone: INSTANTLY_TZ[b.tz as Exclude<Tz, "unknown">], window: `${from}–${to}` }));
  const unknown = buckets.find((b) => b.tz === "unknown")?.count ?? 0;
  return { rows, unknown, hasSequence: sequenceFor(campaignId).length > 0 };
}

export interface TzSplitResultRow {
  label: string;
  ok: boolean;
  childId?: string;
  leads?: number;
  error?: string;
}

/**
 * Split a campaign into one DRAFT Instantly campaign per timezone — same sequence + inboxes,
 * each scheduled for that zone's optimal local window, with that bucket's leads loaded. Children
 * are drafts (never auto-activated); the operator reviews + launches each. Run once.
 */
export async function executeTimezoneSplitAction(campaignId: string): Promise<{ ok: boolean; results: TzSplitResultRow[]; error?: string }> {
  await ensureData();
  const c = getCampaign(campaignId);
  if (!c) return { ok: false, results: [], error: "Campaign not found." };
  if (!integrations.instantly) return { ok: false, results: [], error: "Instantly isn't connected." };
  const steps = sequenceFor(campaignId);
  if (!steps.length) return { ok: false, results: [], error: "No sequence to copy — add copy first." };
  const inboxEmails = getInboxes().filter((i) => c.inboxIds.includes(i.id)).map((i) => i.email);
  if (!inboxEmails.length) return { ok: false, results: [], error: "No sending inboxes assigned to this campaign." };

  const leads = getLeads().filter((l) => l.campaignId === campaignId);
  const { from, to } = optimalWindowHHMM();
  const results: TzSplitResultRow[] = [];
  for (const tz of ["ET", "CT", "MT", "PT"] as const) {
    const bucket = leads.filter((l) => leadTimezone(l) === tz);
    if (!bucket.length) continue;
    const label = `${TZ_LABEL[tz]} (${bucket.length})`;
    try {
      const child = await createInstantlyCampaign({ name: `${c.name} — ${TZ_LABEL[tz]}`, steps, inboxEmails, dailyLimit: c.dailyCap });
      if (!child.id) {
        results.push({ label, ok: false, error: "create returned no id" });
        continue;
      }
      await updateInstantlyCampaignSchedule(child.id, { timezone: INSTANTLY_TZ[tz], from, to });
      const { added } = await addLeadsToCampaign(
        child.id,
        bucket.map((l) => ({ email: l.email, first_name: l.firstName, last_name: l.lastName, company_name: l.company, phone: l.phone ?? undefined })),
      );
      results.push({ label, ok: true, childId: child.id, leads: added });
    } catch (e) {
      results.push({ label, ok: false, error: (e as Error).message });
    }
  }
  return { ok: results.some((r) => r.ok), results };
}
