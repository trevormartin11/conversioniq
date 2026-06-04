/**
 * Computed selectors / read models used by the pages. Pure functions over the
 * store — this is where the cross-tool JOIN and analytics live.
 */

import { appConfig } from "@/lib/config";
import { rate } from "@/lib/format";
import {
  getAlerts,
  getCampaigns,
  getCosts,
  getCreditMeters,
  getDemos,
  getInboxes,
  getLeads,
  getMetrics,
  getReplies,
} from "./store";
import type {
  Campaign,
  CostCategory,
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
  demosBooked: number;
  replyClassCounts: Record<ReplyClass, number>;
  alerts: ReturnType<typeof getAlerts>;
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

  return {
    today: {
      sends: sum("sends"),
      opens: sum("opens"),
      replies: sum("replies"),
      positives: sum("positives"),
      bounces: sum("bounces"),
      demos: sum("demos"),
    },
    queueDepth: replies.filter((r) => r.status === "pending").length,
    hotCount: replies.filter((r) => r.hot && r.status === "pending").length,
    demosBooked: getDemos().filter((d) => d.status === "booked").length,
    replyClassCounts,
    alerts: getAlerts(),
    cards: campaignCards(),
    trend: metrics
      .filter((m) => m.campaignId === "c_medspa")
      .map((m) => ({ date: m.date, sends: m.sends, replies: m.replies, positives: m.positives })),
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
