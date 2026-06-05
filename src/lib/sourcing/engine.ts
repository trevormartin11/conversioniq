/**
 * Sourcing engine — orchestrates route -> search -> enrich -> verify -> dedupe.
 * `buildPlan`/`processLeads` are pure and run with zero spend (and zero keys);
 * `runSourcing` is the live pipeline that lights up as provider keys arrive.
 */
import { dedupeAgainstUniverse } from "@/lib/data/store";
import { buildPlan, platformCapUsd, withinPlatformCap } from "./cost";
import { findymailEnrich, lushaSearch, outscraperSearch, verifyEmail } from "./providers";
import type { SourcedLead, SourcingPlan, SourcingTarget } from "./types";

export { buildPlan };

export interface SourcingStats {
  sourced: number; // raw rows returned by the source
  withEmail: number; // had an email after enrichment
  verified: number; // verified + deduped + not suppressed
  risky: number; // catch-all/unknown — operator's call to send
  rejected: number; // no email + invalid + duplicate + suppressed
}

export interface SourcingResult {
  ok: boolean;
  plan: SourcingPlan;
  leads: SourcedLead[]; // clean, deliverable, deduped — ready to load
  rejected: { email: string; reason: string }[];
  stats: SourcingStats;
  error?: string;
}

const EMPTY: SourcingStats = { sourced: 0, withEmail: 0, verified: 0, risky: 0, rejected: 0 };

/**
 * Pure post-processing: drop no-email + invalid, dedupe against the global
 * suppression universe, and tally deliverability. No keys, no spend — testable.
 */
export function processLeads(raw: SourcedLead[]): {
  leads: SourcedLead[];
  rejected: { email: string; reason: string }[];
  stats: SourcingStats;
} {
  const withEmail = raw.filter((l) => l.email);
  const deliverable = withEmail.filter((l) => l.emailStatus !== "invalid");
  const candidates = deliverable.map((l) => ({ ...l, email: l.email as string })) as Array<
    SourcedLead & { email: string; [k: string]: unknown }
  >;
  const { clean, rejected } = dedupeAgainstUniverse(candidates);
  const leads = clean as unknown as SourcedLead[];
  const stats: SourcingStats = {
    sourced: raw.length,
    withEmail: withEmail.length,
    verified: leads.filter((l) => l.emailStatus === "verified").length,
    risky: leads.filter((l) => l.emailStatus === "risky").length,
    // everything that didn't make the cut: no email, invalid, duplicate, suppressed
    rejected: (raw.length - withEmail.length) + (withEmail.length - deliverable.length) + rejected.length,
  };
  return { leads, rejected, stats };
}

export async function runSourcing(target: SourcingTarget, count: number, budgetCap: number): Promise<SourcingResult> {
  const plan = buildPlan(target, count, budgetCap);
  if (!plan.ready) {
    return { ok: false, plan, leads: [], rejected: [], stats: EMPTY, error: `Add the ${plan.missing.join(" + ")} key${plan.missing.length > 1 ? "s" : ""} to run this lane.` };
  }
  if (!withinPlatformCap(plan.estimate.projectedCost)) {
    return { ok: false, plan, leads: [], rejected: [], stats: EMPTY, error: `Projected $${plan.estimate.projectedCost} exceeds the $${platformCapUsd()} platform ceiling — split into smaller runs.` };
  }
  if (!plan.estimate.withinBudget) {
    return { ok: false, plan, leads: [], rejected: [], stats: EMPTY, error: `Projected $${plan.estimate.projectedCost} exceeds the $${budgetCap} budget cap.` };
  }
  try {
    let raw = plan.route.lane === "maps" ? await outscraperSearch(target, count) : await lushaSearch(target, count);
    if (plan.route.needsEmailEnrichment) raw = await Promise.all(raw.map((l) => findymailEnrich(l)));
    raw = await Promise.all(raw.map(async (l) => (l.email ? { ...l, emailStatus: await verifyEmail(l.email) } : l)));
    const { leads, rejected, stats } = processLeads(raw);
    return { ok: true, plan, leads, rejected, stats };
  } catch (e) {
    return { ok: false, plan, leads: [], rejected: [], stats: EMPTY, error: (e as Error).message };
  }
}
