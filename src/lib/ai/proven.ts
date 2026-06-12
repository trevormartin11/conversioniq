/**
 * Proven signals — what the system has LEARNED, packaged for the generators. New campaigns
 * should start from evidence, not from scratch: subjects that actually win opens, the reasons
 * demos are lost (Jon's feedback loop), and which verticals convert. Pure reads over the
 * hydrated store; returns "" when there isn't enough data to claim anything.
 */
import { getDemos, getLeads, getVariants } from "@/lib/data/store";
import { DEMO_LOST_REASON_LABELS } from "@/lib/data/types";

/** A subject needs this many sends before it counts as evidence. */
const MIN_SENDS = 50;

export function provenContextBlock(): string {
  const lines: string[] = [];

  // 1. Winning subjects, by open rate, across all campaigns.
  const subjects = getVariants()
    .filter((v) => v.sent >= MIN_SENDS)
    .map((v) => ({ subject: v.subject, rate: v.opens / Math.max(1, v.sent), sent: v.sent }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3);
  if (subjects.length) {
    lines.push(`Subject lines PROVEN to win opens (use these patterns): ${subjects.map((s) => `"${s.subject}" (${(s.rate * 100).toFixed(0)}% opens, n=${s.sent})`).join("; ")}`);
  }

  // 2. Why demos are lost — the outcome feedback loop. Address these objections in the copy.
  const lost = new Map<string, number>();
  for (const d of getDemos()) {
    if (d.status === "lost" && d.outcomeReason) lost.set(d.outcomeReason, (lost.get(d.outcomeReason) ?? 0) + 1);
  }
  const lostTop = [...lost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (lostTop.length) {
    lines.push(`Demos are being LOST to: ${lostTop.map(([r, c]) => `${DEMO_LOST_REASON_LABELS[r as keyof typeof DEMO_LOST_REASON_LABELS] ?? r} (${c})`).join(", ")} — pre-empt these objections.`);
  }

  // 3. Which verticals convert to positive replies (where the message resonates).
  const byVertical = new Map<string, { leads: number; positive: number }>();
  for (const l of getLeads()) {
    const v = byVertical.get(l.vertical) ?? { leads: 0, positive: 0 };
    v.leads++;
    if (l.status === "positive" || l.status === "demo_booked" || l.status === "demo_showed" || l.status === "closed") v.positive++;
    byVertical.set(l.vertical, v);
  }
  const verticals = [...byVertical.entries()]
    .filter(([, v]) => v.leads >= 30 && v.positive > 0)
    .map(([name, v]) => ({ name, rate: v.positive / v.leads }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3);
  if (verticals.length) {
    lines.push(`Verticals converting best: ${verticals.map((v) => `${v.name} (${(v.rate * 100).toFixed(1)}% positive)`).join(", ")}.`);
  }

  return lines.length ? `PROVEN signals from our own sending data — weight these over generic best practice:\n${lines.map((l) => `- ${l}`).join("\n")}` : "";
}
