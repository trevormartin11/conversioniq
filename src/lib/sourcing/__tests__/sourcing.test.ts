import { describe, it, expect } from "vitest";
import { routeTarget } from "@/lib/sourcing/router";
import { buildPlan, estimate, platformCapUsd, withinPlatformCap, UNIT_COSTS } from "@/lib/sourcing/cost";
import { processLeads } from "@/lib/sourcing/engine";
import type { SourcedLead } from "@/lib/sourcing/types";

describe("sourcing router — picks the cheapest source that covers the target", () => {
  it("routes hyperlocal verticals to the Maps lane (Outscraper-native email, no separate finder)", () => {
    for (const v of ["Med Spas", "HVAC contractors", "Dental practices", "Roofing companies"]) {
      const r = routeTarget({ vertical: v });
      expect(r.lane).toBe("maps");
      expect(r.provider).toBe("outscraper");
      expect(r.needsEmailEnrichment).toBe(false);
    }
  });

  it("routes $100M+ / enterprise targets to the B2B database lane", () => {
    const r = routeTarget({ vertical: "SaaS platforms", sizeBand: "enterprise" });
    expect(r.lane).toBe("b2b_database");
    expect(r.provider).toBe("lusha");
    expect(r.needsEmailEnrichment).toBe(false);

    const byRevenue = routeTarget({ vertical: "Logistics firms", revenueMin: 100_000_000 });
    expect(byRevenue.lane).toBe("b2b_database");
  });

  it("honors an explicit local override even for a big company", () => {
    const r = routeTarget({ vertical: "Auto dealerships", sizeBand: "enterprise", isLocalPhysical: true });
    expect(r.lane).toBe("maps");
  });
});

describe("sourcing cost model + budget guard", () => {
  it("prices the Maps lane as record + website emails + verify", () => {
    const route = routeTarget({ vertical: "Med Spas" });
    const e = estimate(route, 500, 50);
    expect(e.costPerLead).toBeCloseTo(UNIT_COSTS.maps_record + UNIT_COSTS.maps_email + UNIT_COSTS.verify, 3);
    expect(e.projectedCost).toBeCloseTo(6.8, 1); // (0.003 + 0.01 + 0.0006) * 500
    expect(e.withinBudget).toBe(true);
  });

  it("flags a run that blows the budget cap", () => {
    const route = routeTarget({ vertical: "Logistics firms", revenueMin: 100_000_000 });
    const e = estimate(route, 1000, 20); // db reveal ~0.0606/lead -> ~$60.6 > $20
    expect(e.withinBudget).toBe(false);
  });

  it("enforces a hard platform spend ceiling independent of the UI cap", () => {
    expect(withinPlatformCap(platformCapUsd())).toBe(true);
    expect(withinPlatformCap(platformCapUsd() + 0.01)).toBe(false);
  });

  it("buildPlan reports which keys are missing (nothing wired in test env)", () => {
    const plan = buildPlan({ vertical: "Med Spas" }, 500, 50);
    expect(plan.ready).toBe(false);
    expect(plan.missing).toEqual(expect.arrayContaining(["outscraper", "millionverifier"]));
    expect(plan.missing).not.toContain("findymail"); // local lane no longer depends on it
  });
});

describe("processLeads — verify + dedupe + suppression (the load-time guard)", () => {
  it("keeps deliverable, deduped, non-suppressed leads and tallies the rest", () => {
    const raw: SourcedLead[] = [
      { company: "A Spa", email: "a@aspa.com", emailStatus: "verified", source: "outscraper" },
      { company: "B Spa", email: "b@bspa.com", emailStatus: "risky", source: "outscraper" },
      { company: "C Spa", email: "c@cspa.com", emailStatus: "invalid", source: "outscraper" }, // invalid -> drop
      { company: "D Spa", source: "outscraper" }, // no email -> drop
      { company: "A Spa (dup)", email: "A@aspa.com", emailStatus: "verified", source: "outscraper" }, // duplicate -> drop
      { company: "Competitor", email: "ceo@competitorspa.com", emailStatus: "verified", source: "outscraper" }, // suppressed domain -> drop
    ];
    const { leads, stats } = processLeads(raw);
    expect(leads.map((l) => l.email)).toEqual(["a@aspa.com", "b@bspa.com"]);
    expect(stats.sourced).toBe(6);
    expect(stats.withEmail).toBe(5);
    expect(stats.verified).toBe(1);
    expect(stats.risky).toBe(1);
    expect(stats.rejected).toBe(4); // 1 no-email + 1 invalid + 1 dup + 1 suppressed
  });
});
