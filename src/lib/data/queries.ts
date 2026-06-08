/**
 * Computed selectors / read models used by the pages. Pure functions over the
 * store — this is where the cross-tool JOIN and analytics live.
 */

import { appConfig, DATA_MODE } from "@/lib/config";
import { rate } from "@/lib/format";
import {
  getAssumptions,
  getCampaigns,
  getCosts,
  getCreditMeters,
  getCreditRequests,
  getDemos,
  getInboxes,
  getLeads,
  getMetrics,
  getPersonas,
  getReplies,
  getVariants,
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

/** Richer per-campaign read model for the Campaigns board: the funnel card joined with leads/pace,
 *  pipeline outcomes (demos + interested replies), and the assigned-inbox deliverability picture. */
export interface CampaignBoardCard extends CampaignCard {
  personaName: string;
  steps: number;
  dailyCap: number;
  createdAt: string;
  leadsLoaded: number;
  leadsRemaining: number; // status "new" — loaded but not yet contacted
  runwayDays: number | null; // days to work the remaining list at the daily cap
  demos: number; // demos attributed to this campaign (via lead.campaignId)
  demosWon: number; // status "closed"
  interestedReplies: number; // classification interested | question
  inboxCount: number;
  warmupAvg: number; // 0–100 across assigned inboxes
  inboxesUnderWarmup: number; // not active, or below the warmup gate
}

export function campaignBoard(): CampaignBoardCard[] {
  const base = new Map(campaignCards().map((c) => [c.id, c]));
  const personas = getPersonas();
  const variants = getVariants();
  const leads = getLeads();
  const demos = getDemos();
  const replies = getReplies();
  const inboxes = getInboxes();
  const gate = appConfig.deliverability.warmupGate;
  // demo rows carry only a leadId — attribute each to its lead's campaign.
  const leadCampaign = new Map(leads.map((l) => [l.id, l.campaignId]));

  return getCampaigns().map((c) => {
    const card = base.get(c.id)!;
    const mine = leads.filter((l) => l.campaignId === c.id);
    const remaining = mine.filter((l) => l.status === "new").length;
    const myInboxes = inboxes.filter((i) => c.inboxIds.includes(i.id));
    const myDemos = demos.filter((d) => leadCampaign.get(d.leadId) === c.id);
    return {
      ...card,
      personaName: personas.find((p) => p.id === c.personaId)?.name ?? "—",
      steps: new Set(variants.filter((v) => v.campaignId === c.id).map((v) => v.step)).size,
      dailyCap: c.dailyCap,
      createdAt: c.createdAt,
      leadsLoaded: mine.length,
      leadsRemaining: remaining,
      runwayDays: remaining > 0 && c.dailyCap > 0 ? Math.ceil(remaining / c.dailyCap) : null,
      demos: myDemos.length,
      demosWon: myDemos.filter((d) => d.status === "closed").length,
      interestedReplies: replies.filter((r) => r.campaignId === c.id && (r.classification === "interested" || r.classification === "question")).length,
      inboxCount: myInboxes.length,
      warmupAvg: myInboxes.length ? Math.round(myInboxes.reduce((s, i) => s + i.warmupScore, 0) / myInboxes.length) : 0,
      inboxesUnderWarmup: myInboxes.filter((i) => i.status !== "active" || i.warmupScore < gate).length,
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
  if (hotPending.length) alerts.push({ id: "al_hot", level: "green", title: `${hotPending.length} hot repl${hotPending.length > 1 ? "ies" : "y"} waiting`, detail: "Interested / question replies need a look.", createdAt: now, source: "replies" });
  if (DATA_MODE === "mock") alerts.push({ id: "al_preview", level: "yellow", title: "Preview mode — running on seed data", detail: "Connect Supabase to go live; verify each key in Settings → Test live connections.", createdAt: now, source: "system" });

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

export interface CampaignCapacity {
  warmed: number;
  warming: number;
  paused: number;
  perInboxCap: number;
  dailyCapacity: number; // effective sends/day now (min of campaign cap and warmed inbox caps)
  potentialDaily: number; // if the warming inboxes finish
  campaignCap: number;
  capBound: boolean; // true when the campaign cap (not inboxes) is the limiter
  leadsLoaded: number;
  awaitingFirstTouch: number;
  daysToFirstTouch: number | null;
  sentToday: number;
}

/** What a campaign can actually send today, and the levers to scale it. */
export function campaignCapacity(campaignId: string): CampaignCapacity | null {
  const c = getCampaigns().find((x) => x.id === campaignId);
  if (!c) return null;
  const assigned = getInboxes().filter((i) => c.inboxIds.includes(i.id));
  const warmed = assigned.filter((i) => i.status === "active");
  const warming = assigned.filter((i) => i.status === "warming");
  const paused = assigned.filter((i) => i.status === "paused");
  const warmedCap = warmed.reduce((s, i) => s + i.dailyCap, 0);
  const nonPausedCap = assigned.filter((i) => i.status !== "paused").reduce((s, i) => s + i.dailyCap, 0);
  const dailyCapacity = Math.min(c.dailyCap, warmedCap);
  const potentialDaily = Math.min(c.dailyCap, nonPausedCap);
  const perInboxCap = warmed.length ? Math.round(warmedCap / warmed.length) : assigned[0]?.dailyCap ?? 20;
  const leads = getLeads().filter((l) => l.campaignId === campaignId);
  const awaitingFirstTouch = leads.filter((l) => l.status === "new").length;
  return {
    warmed: warmed.length, warming: warming.length, paused: paused.length, perInboxCap,
    dailyCapacity, potentialDaily, campaignCap: c.dailyCap,
    capBound: warmedCap > c.dailyCap,
    leadsLoaded: leads.length, awaitingFirstTouch,
    daysToFirstTouch: dailyCapacity > 0 ? Math.ceil(awaitingFirstTouch / dailyCapacity) : null,
    sentToday: warmed.reduce((s, i) => s + i.sentToday, 0),
  };
}

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

/**
 * Health of the CIQ feedback loop: of the demos handed to CIQ (have a Deal id), how many
 * have a resolved outcome (won/lost) vs are still awaiting one — the "is the learning loop
 * actually returning signal?" view. `awaiting` matches the reconcile job's open-demo filter.
 */
export function outcomeLoop() {
  const handed = getDemos().filter((d) => d.civDealId);
  const awaiting = handed.filter((d) => d.status !== "closed" && d.status !== "lost");
  const won = handed.filter((d) => d.status === "closed").length;
  const lost = handed.filter((d) => d.status === "lost").length;
  const resolved = won + lost;
  return { handed: handed.length, awaiting: awaiting.length, won, lost, resolved, winRate: resolved > 0 ? won / resolved : 0 };
}

/**
 * Illustrative forward projection from OPERATOR-SET assumptions (never CIQ data): at the
 * daily demo goal, an assumed close rate and an assumed average MRR, how much new residual
 * does the machine add per month? Planning view only — actuals drive residual().
 */
export function projection() {
  const { demosPerDay } = appConfig.goals;
  const { closeRate: assumedCloseRate, monthlyMrr: assumedMonthlyMrr } = getAssumptions();
  const { grossRate, personalRate } = appConfig.residual;
  const monthlyDemos = demosPerDay * 30;
  const monthlyCloses = monthlyDemos * assumedCloseRate;
  const newMrrPerMonth = monthlyCloses * assumedMonthlyMrr;
  return {
    demosPerDay,
    assumedCloseRate,
    assumedMonthlyMrr,
    monthlyDemos,
    monthlyCloses,
    newMrrPerMonth,
    grossResidualAddedMonthly: newMrrPerMonth * grossRate,
    personalResidualAddedMonthly: newMrrPerMonth * personalRate,
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

// Volume-driven spend (scales with how many leads you source) vs. fixed overhead.
// Apollo $ shows up here via the "data" cost line; Claude API $ is added separately by the caller.
const VARIABLE_COST_CATEGORIES = new Set<string>(["data", "leads"]);

export interface CostDashboard {
  fixedMonthly: number;
  variableMonthly: number;
  totalMonthly: number;
  claudeMonthly: number;
  revenueMonthly: number; // gross partnership residual
  netRevenueMonthly: number; // revenue − total costs
  costPerLead: number | null; // variable spend ÷ leads sourced, last 30d (null when no leads yet)
  costPerLeadTrend: "up" | "down" | "flat" | null; // direction vs prior 30d (down = cheaper = good)
  leadsSourced30d: number;
}

/**
 * The Costs-page headline KPIs. Hybrid basis: accrual for the unit-economics figures
 * (recurring spend amortized to monthly), and the caller passes Claude's billed dollars in.
 * Cost-per-lead is VARIABLE spend only (acquisition) ÷ leads sourced, with a 30d-vs-prior-30d trend.
 */
export function costDashboard(claude: { monthlyUsd: number; byDay?: { date: string; usd: number }[] }): CostDashboard {
  const active = getCosts().filter((c) => c.status === "active");
  const fixedMonthly = active
    .filter((c) => c.cadence !== "one_time" && !VARIABLE_COST_CATEGORIES.has(c.category))
    .reduce((s, c) => s + monthlyOf(c), 0);
  const variableEntriesMonthly = active
    .filter((c) => c.cadence !== "one_time" && VARIABLE_COST_CATEGORIES.has(c.category))
    .reduce((s, c) => s + monthlyOf(c), 0);
  const variableMonthly = variableEntriesMonthly + claude.monthlyUsd;
  const totalMonthly = fixedMonthly + variableMonthly;

  const r = residual();
  const revenueMonthly = r.grossMonthly;
  const netRevenueMonthly = revenueMonthly - totalMonthly;

  // cost per lead (variable only), last 30d vs prior 30d
  const now = Date.now();
  const DAY = 86_400_000;
  const inWin = (iso: string, startAgo: number, endAgo: number) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) && t >= now - startAgo * DAY && t < now - endAgo * DAY;
  };
  const leads = getLeads();
  const leads30 = leads.filter((l) => inWin(l.createdAt, 30, 0)).length;
  const leadsPrev = leads.filter((l) => inWin(l.createdAt, 60, 30)).length;
  const oneTimeVar = (a: number, b: number) =>
    active.filter((c) => c.cadence === "one_time" && VARIABLE_COST_CATEGORIES.has(c.category) && inWin(c.startedAt, a, b)).reduce((s, c) => s + c.amount, 0);
  const claudeWin = (a: number, b: number) =>
    claude.byDay?.length
      ? claude.byDay.filter((d) => inWin(`${d.date}T12:00:00Z`, a, b)).reduce((s, d) => s + d.usd, 0)
      : claude.monthlyUsd / 2; // no daily series → split evenly so the trend reflects lead volume
  const varSpend30 = variableEntriesMonthly + oneTimeVar(30, 0) + claudeWin(30, 0);
  const varSpendPrev = variableEntriesMonthly + oneTimeVar(60, 30) + claudeWin(60, 30);
  const costPerLead = leads30 > 0 ? varSpend30 / leads30 : null;
  const costPerLeadPrev = leadsPrev > 0 ? varSpendPrev / leadsPrev : null;
  let costPerLeadTrend: CostDashboard["costPerLeadTrend"] = null;
  if (costPerLead != null && costPerLeadPrev != null) {
    const diff = costPerLead - costPerLeadPrev;
    costPerLeadTrend = Math.abs(diff) <= 0.005 * costPerLeadPrev ? "flat" : diff > 0 ? "up" : "down";
  }

  return { fixedMonthly, variableMonthly, totalMonthly, claudeMonthly: claude.monthlyUsd, revenueMonthly, netRevenueMonthly, costPerLead, costPerLeadTrend, leadsSourced30d: leads30 };
}

/**
 * The north star: booked-demo pace vs the goal (2/day), plus the monthly budget
 * burn-down. This is the number the whole operation is run to blow past.
 */
export function northStar() {
  const metrics = getMetrics();
  const t = today();
  const weekCutoff = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const todayDemos = metrics.filter((m) => m.date === t).reduce((s, m) => s + m.demos, 0);
  const weekDemos = metrics.filter((m) => m.date >= weekCutoff).reduce((s, m) => s + m.demos, 0);
  const dailyGoal = appConfig.goals.demosPerDay;
  const costs = costSummary();
  return {
    todayDemos,
    dailyGoal,
    weekDemos,
    weeklyGoal: dailyGoal * 7,
    monthlySpend: costs.monthly,
    budget: appConfig.goals.monthlyBudgetUsd,
    grossResidualMonthly: costs.grossResidualMonthly,
    netPerPartnerMonthly: costs.netPerPartnerMonthly,
    breakeven: costs.breakeven,
  };
}
