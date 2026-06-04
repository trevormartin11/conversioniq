/** Daily brief — a glanceable Telegram digest of the operation. */
import { ensureData } from "@/lib/data/store";
import { commandSummary, deliverabilitySummary } from "@/lib/data/queries";
import { sendTelegram } from "@/lib/integrations/telegram";
import { num } from "@/lib/format";

export async function sendDailyBrief() {
  await ensureData();
  const s = commandSummary();
  const d = deliverabilitySummary();
  const lines = [
    "*CIQ — Daily Brief*",
    `Sends ${num(s.today.sends)} · Replies ${num(s.today.replies)} · Positive ${num(s.today.positives)}`,
    `Queue: ${num(s.queueDepth)} pending (${num(s.hotCount)} hot) · Demos booked ${num(s.demosBooked)}`,
    `Inboxes: ${d.active}/${d.total} active · ${d.warming} warming · ${d.paused} paused`,
    s.alerts.length ? `\n${s.alerts.map((a) => `• ${a.title}`).join("\n")}` : "All green ✅",
  ];
  const res = await sendTelegram(lines.join("\n"));
  return { sent: res.ok, reason: res.reason };
}
