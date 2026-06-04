/** Deliverability guardrail: auto-pause inboxes that cross bounce/spam thresholds. */
import { appConfig } from "@/lib/config";
import { ensureData, getInboxes, pauseInbox } from "@/lib/data/store";
import { sendTelegram } from "@/lib/integrations/telegram";
import { pct } from "@/lib/format";

export async function enforceDeliverability() {
  await ensureData();
  const inboxes = getInboxes();
  const breaches = inboxes.filter(
    (i) =>
      i.status === "active" &&
      (i.bounceRate > appConfig.deliverability.autoPauseBounceRate ||
        i.spamComplaints >= appConfig.deliverability.autoPauseSpamComplaints),
  );
  for (const i of breaches) {
    const reason =
      i.bounceRate > appConfig.deliverability.autoPauseBounceRate
        ? `bounce ${pct(i.bounceRate, 1)}`
        : `${i.spamComplaints} spam complaints`;
    await pauseInbox(i.id, "system", reason);
    void sendTelegram(`⚠️ Auto-paused *${i.email}* — ${reason}. Protecting domain reputation.`);
  }
  return { checked: inboxes.length, paused: breaches.length };
}
