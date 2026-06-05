/**
 * Computed selectors / read models used by the pages. Pure functions over the
 * store — this is where the cross-tool JOIN and analytics live.
 */

import { appConfig } from "@/lib/config";
import { rate } from "@/lib/format";
import {
  getCampaigns,
  getCosts,
  getCreditMeters,
  getCreditRequests,
  getDemos,
  getInboxes,
  getLeads,
  getMetrics,
  getReplies,
} from "./store";
import type {
  Alert,
  Campaign,
  CostCategory,
  DemoLostReason,
  Health,
  LeadStatus,
  ReplyClass,
} from "./types";

const today = () => new Date().toISOString().slice(0, 10);

export interface CampaignCard {
  id: string;
  name: string;
  vertical: string;
  status: Campaign["status"];
  sent: number;
  openRate: number;
  replyRate: number;
  positiveRate: number;
  bounceRate: number;
  health: Health;
}

function campaignHealth(bounceRate: number, replyRate: number, status: Campaign["status"]): Health {
  if (status === "draft") return "yellow";
  if (bounceRate > appConfig.deliverability.autoPauseBounceRate) return "red";
  if (bounceRate > 0.03 || replyRate < 0.025) return "yellow";
  return "green";
}

export function campaignCards(): CampaignCard[] {
  const metrics = getMetrics();
  return getCampaigns().map((c) => {
    const m = metrics.filter((x) => x.campaignId === c.id);
    const sent = m.reduce((s, x) => s + x.sends, 0);
    const opens = m.reduce((s, x) => s + x.opens, 0);
    const replies = m.reduce((s, x) => s + x.replies, 0);
    const positives = m.reduce((s, x) => s + x.positives, 0);
    const bounces = m.reduce((s, x) => s + x.bounces, 0);
    const bounceRate = rate(bounces, sent);
    const replyRate = rate(replies, sent);
    return {
      id: c.id,
      name: c.name,
      vertical: c.vertical,
      status: c.status,
      sent,
      openRate: rate(opens, sent),
      replyRate,
      positiveRate: rate(positives, sent),
      bounceRate,
      health: campaignHealth(bounceRate, replyRate, c.status),
    };
  });
}

export interface CommandSummary {
  today: { sends: number; opens: number; replies: number; positives: number; bounces: number; demos: number };
  queueDepth: number;
  hotCount: number;
  creditApprovals: number;
  pausedInboxes: number;
  demosBooked: number;
  replyClassCounts: Record<ReplyClass, number>;
  alerts: Alert[];
  cards: CampaignCard[];
  trend: { date: string; sends: number; replies: number; positives: number }[];
}

export function commandSummary(): CommandSummary {
  const metrics = getMetrics();
  const t = today();
  const todays = metrics.filter((m) => m.date === t);
  const sum = (k: "sends" | "opens" | "replies" | "positives" | "bounces" | "demos") =>
    todays.reduce((s, m) => s + m[k], 0);

  const replies = getReplies();
  const replyClassCounts = {} as Record<ReplyClass, number>;
  for (const r of replies) replyClassCounts[r.classification] = (replyClassCounts[r.classification] ?? 0) + 1;

  // Alerts are derived live from current state (paused inboxes, gated spend, hot replies).
  const now = new Date().toISOString();
  const paused = getInboxes().filter((i) => i.status === "paused");
  const pendingCredits = getCreditRequests().filter((r) => r.status === "pending");
  const pendingReplies = replies.filter((r) => r.status === "pending");
  const hotPending = pendingReplies.filter((r) => r.hot);
  const alerts: Alert[] = [];
  if (paused.length) alerts.push({ id: "al_paused", level: "red", title: `${paused.length} inbox${paused.length > 1 ? "es" : ""} paused`, detail: "Paused to protect domain reputation. Review in Deliverability.", createdAt: now, source: "deliverability" });
  if (pendingCredits.length) alerts.push({ id: "al_credits", level: "yellow", title: "CIQ credit spend awaiting approval", detail: `${pendingCredits.length} request(s) need a decision.`, createdAt: now, source: "credits" });
  if (hotPending.length) alerts.push({ id: "al_hot", level: "green", title: `${hotPending.length} hot repl${hotPending.length > 1 ? "ies" : "y"} waiting`, detail: "Interested / question replies need a look.", createdAt: now, source: "replies" });

  return {
    today: {
      sends: sum("sends"),
      opens: sum("opens"),
      replies: sum("replies"),
      positives: sum("positives"),
      bounces: sum("bounces"),
      demos: sum("demos"),
    },
    queueDepth: pendingReplies.length,
    hotCount: hotPending.length,
    creditApprovals: pendingCredits.length,
    pausedInboxes: paused.length,
    demosBooked: getDemos().filter((d) => d.status === "booked").length,
    replyClassCounts,
    alerts,
    cards: campaignCards(),
    trend: (() => {
      const byDate = new Map<string, { sends: number; replies: number; positives: number }>();
      for (const m of metrics) {
        const cur = byDate.get(m.date) ?? { sends: 0, replies: 0, positives: 0 };
        cur.sends += m.sends;
        cur.replies += m.replies;
        cur.positives += m.positives;
        byDate.set(m.date, cur);
      }
      return [...byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-14)
        .map(([date, v]) => ({ date, ...v }));
    })(),
  };
}

// --- inbox / deliverability health -----------------------------------------
export interface DomainHealth {
  domain: string;
  persona: string;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  inboxes: number;
  active: number;
  warming: number;
  paused: number;
  avgWarmup: number;
  health: Health;
}

export function deliverabilitySummary() {
  const inboxes = getInboxes();
  const active = inboxes.filter((i) => i.status === "active");
  const warming = inboxes.filter((i) => i.status === "warming");
  const paused = inboxes.filter((i) => i.status === "paused");
  const atRisk = inboxes.filter(
    (i) =>
      i.bounceRate > appConfig.deliverability.autoPauseBounceRate ||
      i.spamComplaints >= appConfig.deliverability.autoPauseSpamComplaints,
  );
  const capacity = active.reduce((s, i) => s + i.dailyCap, 0);
  const sentToday = active.reduce((s, i) => s + i.sentToday, 0);
  return {
    total: inboxes.length,
    active: active.length,
    warming: warming.length,
    paused: paused.length,
    atRisk: atRisk.length,
    capacity,
    sentToday,
    avgWarmup: Math.round(rate(inboxes.reduce((s, i) => s + i.warmupScore, 0), inboxes.length)),
    belowGate: inboxes.filter((i) => i.warmupScore < appConfig.deliverability.warmupGate).length,
  };
}

// --- pipeline & residual ----------------------------------------------------
const FUNNEL: LeadStatus[] = [
  "contacted",
  "opened",
  "replied",
  "positive",
  "demo_booked",
  "demo_showed",
  "closed",
];

export function pipeline() {
  const leads = getLeads();
  const counts = {} as Record<LeadStatus, number>;
  for (const l of leads) counts[l.status] = (counts[l.status] ?? 0) + 1;
  // funnel is cumulative: a "closed" lead also passed through every prior stage
  const order: LeadStatus[] = ["new", ...FUNNEL, "lost"];
  const idx = (s: LeadStatus) => order.indexOf(s);
  const funnel = FUNNEL.map((stage) => ({
    stage,
    count: leads.filter((l) => l.status !== "lost" && idx(l.status) >= idx(stage)).length,
  }));
  const demos = getDemos();
  return {
    funnel,
    counts,
    demos: {
      booked: demos.filter((d) => d.status === "booked").length,
      showed: demos.filter((d) => d.status === "showed").length,
      noShow: demos.filter((d) => d.status === "no_show").length,
      closed: demos.filter((d) => d.status === "closed").length,
    },
  };
}

export function residual() {
  const closed = getDemos().filter((d) => d.status === "closed" && d.mrr);
  const totalMrr = closed.reduce((s, d) => s + (d.mrr ?? 0), 0);
  const grossMonthly = totalMrr * appConfig.residual.grossRate;
  const personalMonthly = totalMrr * appConfig.residual.personalRate;
  return {
    closedCount: closed.length,
    totalMrr,
    grossMonthly,
    personalMonthly,
    grossAnnual: grossMonthly * 12,
    personalAnnual: personalMonthly * 12,
    grossRate: appConfig.residual.grossRate,
    personalRate: appConfig.residual.personalRate,
  };
}

export type AttributionDim = "vertical" | "persona" | "source" | "sendingDomain";
export interface AttributionRow {
  key: string;
  leads: number;
  positive: number;
  demos: number;
  closed: number;
  mrr: number;
  closeRate: number;
}

/**
 * Per-cell conversion from the attribution tags baked into each lead at source.
 * "Which vertical / persona / source / sending domain actually converts to MRR?"
 */
export function attribution(dim: AttributionDim): AttributionRow[] {
  const closedMrr = new Map<string, number>();
  for (const d of getDemos()) {
    if (d.status === "closed" && d.mrr) closedMrr.set(d.leadId, (closedMrr.get(d.leadId) ?? 0) + d.mrr);
  }
  const order: LeadStatus[] = ["new", ...FUNNEL, "lost"];
  const idx = (s: LeadStatus) => order.indexOf(s);
  const positiveIdx = idx("positive");
  const demoIdx = idx("demo_booked");
  const groups = new Map<string, AttributionRow>();
  for (const l of getLeads()) {
    const key = String(l[dim] || "—");
    const row = groups.get(key) ?? { key, leads: 0, positive: 0, demos: 0, closed: 0, mrr: 0, closeRate: 0 };
    row.leads++;
    const li = idx(l.status);
    if (l.status !== "lost" && li >= positiveIdx) row.positive++;
    if (l.status !== "lost" && li >= demoIdx) row.demos++;
    if (l.status === "closed") row.closed++;
    row.mrr += closedMrr.get(l.id) ?? 0;
    groups.set(key, row);
  }
  return [...groups.values()]
    .map((r) => ({ ...r, closeRate: r.leads ? r.closed / r.leads : 0 }))
    .sort((a, b) => b.mrr - a.mrr || b.leads - a.leads);
}

// --- close the loop: realized close data -> where to spend sourcing next ----
export interface SourcingRec {
  vertical: string;
  action: "scale" | "hold" | "cut";
  reason: string;
  leads: number;
  closed: number;
  mrr: number;
  closeRate: number;
}

/** Classify one cell into a sourcing move from its realized conversion. */
export function classifyCell(r: { leads: number; closed: number; closeRate: number; mrr: number }): { action: SourcingRec["action"]; reason: string } {
  if (r.leads < 20) return { action: "hold", reason: `Only ${r.leads} leads — keep testing before judging.` };
  if (r.closed > 0 && r.closeRate >= 0.02) return { action: "scale", reason: `${(r.closeRate * 100).toFixed(1)}% close${r.mrr ? `, $${r.mrr.toLocaleString()}/mo booked` : ""} — source more here.` };
  if (r.closed === 0) return { action: "cut", reason: `${r.leads} leads, 0 closed — pull budget until the angle improves.` };
  return { action: "hold", reason: "Converting but thin — hold and watch." };
}

/** The closed-loop recommendation: feed realized close-rate/MRR per vertical back into sourcing. */
export function sourcingRecommendations(): SourcingRec[] {
  const order: Record<SourcingRec["action"], number> = { scale: 0, hold: 1, cut: 2 };
  return attribution("vertical")
    .filter((r) => r.key && r.key !== "—")
    .map((r) => {
      const c = classifyCell(r);
      return { vertical: r.key, action: c.action, reason: c.reason, leads: r.leads, closed: r.closed, mrr: r.mrr, closeRate: r.closeRate };
    })
    .sort((a, b) => order[a.action] - order[b.action] || b.mrr - a.mrr);
}

/** Why demos are lost — the structured outcome reasons, aggregated for the learning loop. */
export function lostReasons(): { reason: DemoLostReason; count: number }[] {
  const counts = new Map<DemoLostReason, number>();
  for (const d of getDemos()) {
    if (d.status === "lost" && d.outcomeReason) counts.set(d.outcomeReason, (counts.get(d.outcomeReason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

export function creditSummary() {
  return getCreditMeters().map((m) => ({
    ...m,
    remaining: m.total - m.used,
    pctUsed: rate(m.used, m.total),
  }));
}

// --- costs / P&L ------------------------------------------------------------
/** Normalize any cost to a monthly figure (one-time costs excluded from recurring). */
function monthlyOf(c: { amount: number; cadence: string }): number {
  if (c.cadence === "monthly") return c.amount;
  if (c.cadence === "annual") return c.amount / 12;
  return 0;
}

/**
 * Unit economics — the number that says whether the machine is profitable.
 * "Blended to date": recurring spend prorated over each cost's months active, plus
 * one-time spend, divided by demos booked / accounts closed. Payback compares CAC to
 * the gross residual a closed account throws off per month.
 */
export function unitEconomics() {
  const active = getCosts().filter((c) => c.status === "active");
  const now = Date.now();
  const MONTH_MS = 30.44 * 86_400_000;
  let investedToDate = 0;
  for (const c of active) {
    if (c.cadence === "one_time") { investedToDate += c.amount; continue; }
    const monthsActive = Math.max(0, (now - new Date(c.startedAt).getTime()) / MONTH_MS);
    investedToDate += monthlyOf(c) * monthsActive;
  }
  const demos = getDemos();
  const demosBooked = demos.length;
  const closed = demos.filter((d) => d.status === "closed").length;
  const r = residual();
  const monthlyBurn = active.reduce((s, c) => s + monthlyOf(c), 0);

  const costPerDemo = demosBooked ? investedToDate / demosBooked : null;
  const cac = closed ? investedToDate / closed : null;
  const grossPerAccountMonthly = closed ? r.grossMonthly / closed : null;
  const paybackMonths = cac != null && grossPerAccountMonthly ? cac / grossPerAccountMonthly : null;

  return {
    investedToDate, monthlyBurn, demosBooked, closed,
    closeRate: demosBooked ? closed / demosBooked : 0,
    costPerDemo, cac, grossPerAccountMonthly, paybackMonths,
  };
}

export function costSummary() {
  const active = getCosts().filter((c) => c.status === "active");
  const monthly = active.reduce((s, c) => s + monthlyOf(c), 0);
  const oneTime = active.filter((c) => c.cadence === "one_time").reduce((s, c) => s + c.amount, 0);
  const byCategory = {} as Record<CostCategory, number>;
  for (const c of active) byCategory[c.category] = (byCategory[c.category] ?? 0) + monthlyOf(c);

  const r = residual();
  const netMonthly = r.grossMonthly - monthly;
  return {
    monthly,
    annual: monthly * 12,
    oneTime,
    byCategory,
    activeCount: active.length,
    grossResidualMonthly: r.grossMonthly,
    netMonthly,
    netPerPartnerMonthly: netMonthly / appConfig.residual.splitWays,
    breakeven: r.grossMonthly >= monthly,
  };
}
