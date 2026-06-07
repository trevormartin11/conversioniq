"use server";

import { ensureData, getCampaign, getLeads, getVariants } from "@/lib/data/store";
import { updateInstantlyCampaignSchedule, updateInstantlyCampaignSequence } from "@/lib/integrations/instantly";
import { integrations } from "@/lib/config";
import { bucketByTimezone, OPTIMAL_WINDOW, type Tz } from "@/lib/send-timing";

// Instantly's schedule timezone is a restricted enum (verified live against the API):
// New_York / Denver / Los_Angeles are REJECTED — these city names are the accepted
// equivalents. Instantly has no Pacific (UTC-8) entry, so Pacific maps to Boise (Mountain),
// the closest accepted zone (~1h early for PT). Unknown falls back to Chicago.
const TZ_IANA: Record<Exclude<Tz, "unknown">, string> = {
  ET: "America/Detroit",
  CT: "America/Chicago",
  MT: "America/Boise",
  PT: "America/Boise",
};

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
  const timezone = dominant ? TZ_IANA[dominant] : "America/Chicago"; // Chicago is the known-good default
  const from = `${String(OPTIMAL_WINDOW.startHour).padStart(2, "0")}:00`;
  const to = `${String(OPTIMAL_WINDOW.endHour).padStart(2, "0")}:${String(OPTIMAL_WINDOW.endMinute).padStart(2, "0")}`;

  try {
    await updateInstantlyCampaignSchedule(c.instantlyCampaignId, { timezone, from, to });
    return { ok: true, timezone };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
