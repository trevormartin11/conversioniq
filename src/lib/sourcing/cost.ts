/**
 * Cost model + budget guard. All figures are conservative pay-as-you-go list
 * prices (USD/lead) so a plan never under-promises spend. Nothing here spends a
 * cent — it only projects, so the operator can decide before committing.
 */
import { integrations } from "@/lib/config";
import type { CostLine, RoutedSource, SourcingEstimate, SourcingPlan, SourcingTarget } from "./types";
import { routeTarget } from "./router";

export const UNIT_COSTS = {
  maps_record: 0.003, // Outscraper Google Maps record
  email_enrich: 0.02, // Findymail / Prospeo email-find
  verify: 0.0006, // MillionVerifier
  db_reveal: 0.06, // Lusha / Apollo paid email reveal (blended)
} as const;

const round = (n: number) => Math.round(n * 1000) / 1000;

export function estimate(route: RoutedSource, count: number, budgetCap: number): SourcingEstimate {
  const lines: CostLine[] = [];
  let perLead = 0;

  if (route.lane === "maps") {
    lines.push({ step: "Maps record", provider: "outscraper", unit: UNIT_COSTS.maps_record, total: round(UNIT_COSTS.maps_record * count) });
    lines.push({ step: "Email enrichment", provider: "findymail", unit: UNIT_COSTS.email_enrich, total: round(UNIT_COSTS.email_enrich * count) });
    perLead = UNIT_COSTS.maps_record + UNIT_COSTS.email_enrich;
  } else {
    lines.push({ step: "Contact reveal", provider: route.provider, unit: UNIT_COSTS.db_reveal, total: round(UNIT_COSTS.db_reveal * count) });
    perLead = UNIT_COSTS.db_reveal;
  }
  // Verification is always on — the highest-leverage dollar for protecting the fleet.
  lines.push({ step: "Verify", provider: "millionverifier", unit: UNIT_COSTS.verify, total: round(UNIT_COSTS.verify * count) });
  perLead += UNIT_COSTS.verify;

  const projectedCost = round(perLead * count);
  return { count, costPerLead: round(perLead), projectedCost, withinBudget: projectedCost <= budgetCap, lines };
}

/** Which provider keys a route needs to actually run (vs. just plan). */
export function requiredProviders(route: RoutedSource): ("lusha" | "outscraper" | "findymail" | "millionverifier")[] {
  return route.lane === "maps"
    ? ["outscraper", "findymail", "millionverifier"]
    : ["lusha", "millionverifier"];
}

/** Route + cost + readiness — zero spend. Safe to render before the operator commits. */
export function buildPlan(target: SourcingTarget, count: number, budgetCap: number): SourcingPlan {
  const route = routeTarget(target);
  const est = estimate(route, count, budgetCap);
  const missing = requiredProviders(route).filter((p) => !integrations[p]);
  return { target, route, estimate: est, ready: missing.length === 0, missing };
}
