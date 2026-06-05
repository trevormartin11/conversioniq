/** Deliverability guardrail: auto-pause inboxes AND campaigns that cross bounce/spam thresholds. */
import { appConfig, integrations } from "@/lib/config";
import { ensureData, getCampaigns, getInboxes, getMetrics, pauseInbox, setCampaignStatus } from "@/lib/data/store";
import { pauseCampaign } from "@/lib/integrations/instantly";
import { sendTelegram } from "@/lib/integrations/telegram";
import { pct, rate } from "@/lib/format";

const WINDOW_DAYS = 7;
const MIN_SENDS = 100; // don't pause a campaign on a tiny sample

export async function enforceDeliverability() {
  await ensureData();
  const inboxes = getInboxes();

  // 1) Per-INBOX bounce/spam breach -> pause the inbox AND actually stop the live
  //    campaigns it sends from in Instantly (not just a status flip in our DB).
  const breaches = inboxes.filter(
    (i) =>
      i.status === "active" &&
      (i.bounceRate > appConfig.deliverability.autoPauseBounceRate ||
        i.spamComplaints >= appConfig.deliverability.autoPauseSpamComplaints),
  );
  let campaignsStopped = 0;
  for (const i of breaches) {
    const reason =
      i.bounceRate > appConfig.deliverability.autoPauseBounceRate
        ? `bounce ${pct(i.bounceRate, 1)}`
        : `${i.spamComplaints} spam complaints`;
    await pauseInbox(i.id, "system", reason);
    if (integrations.instantly) {
      for (const c of getCampaigns().filter((c) => c.status === "active" && c.instantlyCampaignId && c.inboxIds.includes(i.id))) {
        try {
          await pauseCampaign(c.instantlyCampaignId!);
          await setCampaignStatus(c.id, "paused", "system");
          campaignsStopped++;
        } catch { /* inbox is already paused in-hub + we alert; don't let one failure stop the sweep */ }
      }
    }
    void sendTelegram(`⚠️ Auto-paused *${i.email}* — ${reason}. Protecting domain reputation.`);
  }

  // 2) Per-CAMPAIGN bounce breach over the recent window. Uses REAL synced metrics
  //    (daily_metrics), so unlike the inbox check it actually fires with live data today.
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
  const metrics = getMetrics();
  let campaignsPaused = 0;
  for (const c of getCampaigns()) {
    if (c.status !== "active") continue; // (a campaign stopped in step 1 is already "paused")
    const m = metrics.filter((x) => x.campaignId === c.id && x.date >= cutoff);
    const sent = m.reduce((s, x) => s + x.sends, 0);
    if (sent < MIN_SENDS) continue;
    const br = rate(m.reduce((s, x) => s + x.bounces, 0), sent);
    if (br > appConfig.deliverability.autoPauseBounceRate) {
      if (integrations.instantly && c.instantlyCampaignId) {
        try { await pauseCampaign(c.instantlyCampaignId); } catch { /* alert below regardless */ }
      }
      await setCampaignStatus(c.id, "paused", "system");
      campaignsPaused++;
      void sendTelegram(`⚠️ Auto-paused campaign *${c.name}* — ${pct(br, 1)} bounce over ${WINDOW_DAYS}d. Protecting domain reputation.`);
    }
  }

  return { checked: inboxes.length, inboxesPaused: breaches.length, campaignsStopped, campaignsPaused };
}
