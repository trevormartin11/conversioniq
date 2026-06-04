/** Daily brief — a glanceable Telegram digest of the operation. */
import { ensureData } from "@/lib/data/store";
import { commandSummary, costSummary, deliverabilitySummary, pipeline, residual } from "@/lib/data/queries";
import { sendTelegram } from "@/lib/integrations/telegram";
import { num, usd } from "@/lib/format";

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

export async function sendWeeklyReport() {
  await ensureData();
  const s = commandSummary();
  const d = deliverabilitySummary();
  const p = pipeline();
  const r = residual();
  const c = costSummary();
  const lines = [
    "*CIQ — Weekly Report*",
    `Demos: ${p.demos.booked} booked · ${p.demos.showed} showed · ${p.demos.closed} closed`,
    `Pipeline: ${p.counts.contacted ?? 0} contacted → ${p.counts.replied ?? 0} replied → ${p.counts.positive ?? 0} positive`,
    `Residual: ${usd(r.grossMonthly)}/mo gross · your share ${usd(r.personalMonthly)}/mo`,
    `Costs: ${usd(c.monthly)}/mo · ${c.breakeven ? "above" : "below"} break-even (net ${usd(c.netMonthly)}/mo)`,
    `Inboxes: ${d.active}/${d.total} active · queue ${num(s.queueDepth)} pending`,
  ];
  const res = await sendTelegram(lines.join("\n"));
  return { sent: res.ok, reason: res.reason };
}
