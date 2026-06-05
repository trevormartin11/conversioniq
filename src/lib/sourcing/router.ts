/**
 * The smart router — given a target, pick the cheapest source that actually
 * COVERS it. Grounded in the bake-off: B2B databases (Apollo/Lusha) capture only
 * a thin slice of hyperlocal owners (e.g. ~147 med-spa contacts nationally, ~40%
 * with any email), whereas every local storefront is on Google Maps. So local ->
 * Maps; corporate/$100M+ -> B2B database (verified work emails for corporate titles).
 */
import type { RoutedSource, SourcingTarget } from "./types";

/** Verticals that are local, physical, owner-operated — Maps territory. */
const LOCAL_HINTS = [
  "spa", "med spa", "medical spa", "aesthetic", "wellness", "dental", "dentist",
  "orthodont", "hvac", "plumb", "roof", "electric", "salon", "barber", "clinic",
  "chiropract", "gym", "fitness", "vet", "auto", "repair", "restaurant", "cafe",
  "landscap", "contractor", "remodel", "pest", "cleaning", "optometr", "dermatol",
  "med practice", "physical therapy", "real estate", "insurance agency", "law firm",
];

function fmtRevenue(n?: number): string {
  if (!n) return "";
  return n >= 1_000_000_000 ? `$${(n / 1e9).toFixed(1)}B` : `$${Math.round(n / 1e6)}M`;
}

export function routeTarget(t: SourcingTarget): RoutedSource {
  const v = t.vertical.toLowerCase();
  const localByHint = LOCAL_HINTS.some((h) => v.includes(h));
  const enterprise =
    t.sizeBand === "enterprise" ||
    t.sizeBand === "mid_market" ||
    (t.revenueMin ?? 0) >= 100_000_000;

  // Explicit override wins; otherwise infer from size band, then the vertical hint.
  const local =
    t.isLocalPhysical ?? (t.sizeBand ? t.sizeBand === "local_smb" : localByHint);

  if (enterprise && !t.isLocalPhysical) {
    const band = t.sizeBand ? t.sizeBand.replace("_", "-") : `${fmtRevenue(t.revenueMin)}+`;
    return {
      lane: "b2b_database",
      provider: "lusha",
      reason: `Corporate / ${band} target — verified work emails for VP/C-suite titles are a B2B-database strength, and reveal volume here is low + high-value.`,
      needsEmailEnrichment: false,
      paid: true,
    };
  }

  if (local) {
    return {
      lane: "maps",
      provider: "outscraper",
      reason: `Local, physical, owner-operated — Google Maps has near-complete coverage (every storefront is listed, fresh), where B2B databases capture only a thin slice of owners. Outscraper returns the business's published website email inline (verified before load).`,
      needsEmailEnrichment: false, // Outscraper pulls website emails in the same call — no separate finder
      paid: true,
    };
  }

  // Ambiguous: start cheap (Maps), escalate to a database only if coverage proves thin.
  return {
    lane: "maps",
    provider: "outscraper",
    reason: `No strong corporate signal — start on the cheaper Maps lane (Outscraper returns website emails inline) and escalate to a B2B database only if coverage proves thin.`,
    needsEmailEnrichment: false,
    paid: true,
  };
}
