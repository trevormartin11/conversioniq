/** Lead-sourcing engine — shared types. */

export type SourceLane = "maps" | "b2b_database";
export type SourceProvider = "outscraper" | "lusha" | "apollo" | "import";

export type SizeBand = "local_smb" | "mid_market" | "enterprise";

/** What we're trying to source — produced by the strategy studio or entered by hand. */
export interface SourcingTarget {
  vertical: string;
  geo?: string; // "United States" | "Dallas, TX" | ...
  titles?: string[]; // decision-maker titles; sensible defaults applied if omitted
  sizeBand?: SizeBand;
  revenueMin?: number; // for enterprise targeting (USD)
  /** Override the local-vs-corporate heuristic when you know better. */
  isLocalPhysical?: boolean;
}

/** The router's decision: which lane/provider, why, and what it implies downstream. */
export interface RoutedSource {
  lane: SourceLane;
  provider: SourceProvider;
  reason: string;
  needsEmailEnrichment: boolean; // Maps records have no email -> enrich step required
  paid: boolean; // true -> costs provider credits (meters on Leads → Credits & budget)
}

/** A sourced lead, normalized across providers. Email is absent until enriched/revealed. */
export interface SourcedLead {
  firstName?: string;
  lastName?: string;
  email?: string;
  emailStatus?: "verified" | "risky" | "invalid" | "unknown";
  company: string;
  domain?: string;
  title?: string;
  city?: string;
  state?: string;
  phone?: string; // Maps records carry a phone even before email enrichment
  source: SourceProvider;
}

export interface CostLine {
  step: string;
  provider: string;
  unit: number; // $ per lead for this step
  total: number; // $ for the whole run
}

export interface SourcingEstimate {
  count: number;
  costPerLead: number;
  projectedCost: number;
  withinBudget: boolean;
  lines: CostLine[];
}

/** A plan is route + cost, computed with ZERO spend — safe to show before committing. */
export interface SourcingPlan {
  target: SourcingTarget;
  route: RoutedSource;
  estimate: SourcingEstimate;
  ready: boolean; // are the provider keys present to actually run it?
  missing: string[]; // provider keys needed to run, if any
}
