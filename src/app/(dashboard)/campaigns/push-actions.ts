"use server";

import { ensureData, getCampaign, getCampaigns, getInboxes, getLeads, getVariants } from "@/lib/data/store";
import {
  addLeadsToCampaign,
  createInstantlyCampaign,
  updateInstantlyCampaignSchedule,
  updateInstantlyCampaignSequence,
} from "@/lib/integrations/instantly";
import { integrations } from "@/lib/config";
import { rewriteCopy } from "@/lib/ai/copy";
import { INSTANTLY_TZ, OPTIMAL_DAYS, TZ_LABEL, bucketByTimezone, leadTimezone, optimalWindowHHMM, type Tz } from "@/lib/send-timing";

const PERSONALIZATION_TAG = "{{personalization}}";

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

/**
 * Upgrade a campaign's sequence in place and push it to Instantly: prepend the
 * {{personalization}} opener to step 1 (filled per-lead at load via the Hyper-Personalization
 * flow) and add a second, AI-generated subject variant to each step for an A/B test. Idempotent
 * — re-running skips steps that are already personalized / already have two variants.
 */
export async function upgradeSequenceAction(
  campaignId: string,
): Promise<{ ok: boolean; error?: string; steps?: number; subjectsAdded?: number; personalized?: boolean }> {
  await ensureData();
  const c = getCampaign(campaignId);
  if (!c?.instantlyCampaignId) return { ok: false, error: "This campaign isn't linked to an Instantly campaign yet." };
  if (!integrations.instantly) return { ok: false, error: "Instantly isn't connected." };
  const vars = getVariants().filter((v) => v.campaignId === campaignId);
  if (!vars.length) return { ok: false, error: "No sequence copy to upgrade." };

  const byStep = new Map<number, { subject: string; body: string }[]>();
  for (const v of [...vars].sort((a, b) => a.step - b.step || a.variant.localeCompare(b.variant))) {
    const arr = byStep.get(v.step) ?? [];
    arr.push({ subject: v.subject, body: v.body });
    byStep.set(v.step, arr);
  }
  const stepKeys = [...byStep.keys()].sort((a, b) => a - b);

  let subjectsAdded = 0;
  let personalized = false;
  const stepsVariants: { subject: string; body: string }[][] = [];
  for (const step of stepKeys) {
    const variants = byStep.get(step)!.map((v) => ({ ...v }));
    // 1) personalization opener on step 1's primary variant
    if (step === stepKeys[0] && !variants[0].body.includes(PERSONALIZATION_TAG)) {
      variants[0] = { ...variants[0], body: `${PERSONALIZATION_TAG}\n\n${variants[0].body}` };
      personalized = true;
    }
    // 2) add a second subject variant (A/B) when the step has only one
    if (variants.length === 1) {
      const alt = await rewriteCopy({
        subject: variants[0].subject,
        body: variants[0].body,
        instruction: "Write ONLY an alternate subject line for an A/B test — same intent, a different angle (more direct or more curiosity-driven). Keep it short and lowercase. Do not change the body.",
      });
      const altSubject = alt.subject.trim();
      if (alt.source === "ai" && altSubject && altSubject.toLowerCase() !== variants[0].subject.trim().toLowerCase()) {
        variants.push({ subject: altSubject, body: variants[0].body });
        subjectsAdded++;
      }
    }
    stepsVariants.push(variants);
  }

  try {
    await updateInstantlyCampaignSequence(c.instantlyCampaignId, stepsVariants);
    return { ok: true, steps: stepKeys.length, subjectsAdded, personalized };
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
    await updateInstantlyCampaignSchedule(c.instantlyCampaignId, { timezone, from, to, days: OPTIMAL_DAYS });
    return { ok: true, timezone };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Fleet-wide: set every live (Instantly-linked) campaign to the mid-week Tue/Wed/Thu schedule + optimal
 * window, each in its dominant lead timezone. Operator-triggered + idempotent — re-running just re-asserts
 * the same schedule. This is how existing campaigns adopt the standard (new ones get it at creation).
 */
export async function normalizeAllSchedulesAction(): Promise<{
  ok: boolean;
  applied: number;
  failed: number;
  results: { name: string; ok: boolean; timezone?: string; error?: string }[];
}> {
  await ensureData();
  if (!integrations.instantly) return { ok: false, applied: 0, failed: 0, results: [{ name: "Instantly", ok: false, error: "Instantly isn't connected." }] };
  const { from, to } = optimalWindowHHMM();
  const live = getCampaigns().filter((c) => c.instantlyCampaignId);
  const results: { name: string; ok: boolean; timezone?: string; error?: string }[] = [];
  let applied = 0;
  let failed = 0;
  for (const c of live) {
    const leads = getLeads().filter((l) => l.campaignId === c.id);
    const dominant = bucketByTimezone(leads)
      .filter((b) => b.tz !== "unknown")
      .sort((a, b) => b.count - a.count)[0]?.tz as Exclude<Tz, "unknown"> | undefined;
    const timezone = dominant ? INSTANTLY_TZ[dominant] : "America/Chicago";
    try {
      await updateInstantlyCampaignSchedule(c.instantlyCampaignId!, { timezone, from, to, days: OPTIMAL_DAYS });
      applied++;
      results.push({ name: c.name, ok: true, timezone });
    } catch (e) {
      failed++;
      results.push({ name: c.name, ok: false, error: (e as Error).message });
    }
  }
  return { ok: failed === 0 && applied > 0, applied, failed, results };
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
