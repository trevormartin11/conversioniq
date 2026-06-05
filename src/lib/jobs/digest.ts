/** Daily brief — a glanceable Telegram digest of the operation. */
import { ensureData, getDomains } from "@/lib/data/store";
import { commandSummary, costSummary, deliverabilitySummary, lostReasons, pipeline, residual, sourcingRecommendations, unitEconomics } from "@/lib/data/queries";
import { sendTelegram } from "@/lib/integrations/telegram";
import { DEMO_LOST_REASON_LABELS } from "@/lib/data/types";
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

/** The weekly report text — pure, so it's testable without sending. Call ensureData() first. */
export function buildWeeklyReport(): string {
  const s = commandSummary();
  const d = deliverabilitySummary();
  const p = pipeline();
  const r = residual();
  const c = costSummary();
  const econ = unitEconomics();
  const recs = sourcingRecommendations();
  const lost = lostReasons();
  const scale = recs.find((x) => x.action === "scale");
  const cut = recs.find((x) => x.action === "cut");
  const dmarcFail = getDomains().filter((dm) => !dm.dmarc).length;
  const money = (v: number | null) => (v == null ? "—" : usd(v));

  return [
    "*CIQ — Weekly Report*",
    `Demos: ${p.demos.booked} booked · ${p.demos.showed} showed · ${p.demos.closed} closed · ${p.demos.noShow} no-show`,
    `Economics: ${money(econ.costPerDemo)}/demo · CAC ${money(econ.cac)} · payback ${econ.paybackMonths == null ? "—" : `${econ.paybackMonths.toFixed(1)}mo`}`,
    `Residual: ${usd(r.grossMonthly)}/mo gross · your share ${usd(r.personalMonthly)}/mo`,
    `Costs: ${usd(c.monthly)}/mo · ${c.breakeven ? "above" : "below"} break-even (net ${usd(c.netMonthly)}/mo)`,
    `Inboxes: ${d.active}/${d.total} active · ${d.warming} warming${dmarcFail ? ` · ⚠️ ${dmarcFail} domains missing DMARC` : ""}`,
    scale ? `📈 Scale: ${scale.vertical} — ${(scale.closeRate * 100).toFixed(1)}% close` : "",
    cut ? `✂️ Fix/cut: ${cut.vertical} — ${cut.reason}` : "",
    lost.length ? `Top loss: ${DEMO_LOST_REASON_LABELS[lost[0].reason]} (${lost[0].count})` : "",
    `Queue: ${num(s.queueDepth)} pending (${num(s.hotCount)} hot)`,
  ].filter(Boolean).join("\n");
}

export async function sendWeeklyReport() {
  await ensureData();
  const res = await sendTelegram(buildWeeklyReport());
  return { sent: res.ok, reason: res.reason };
}
