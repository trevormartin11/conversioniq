import { describe, it, expect } from "vitest";
import { estimate, isValidCount, withinPlatformCap, MAX_RUN_COUNT } from "@/lib/sourcing/cost";
import type { RoutedSource } from "@/lib/sourcing/types";

const mapsRoute: RoutedSource = { lane: "maps", provider: "outscraper", reason: "test", needsEmailEnrichment: true, paid: true };

describe("sourcing count + cost guards", () => {
  it("rejects non-positive, non-integer, and over-ceiling counts", () => {
    expect(isValidCount(-500)).toBe(false);
    expect(isValidCount(0)).toBe(false);
    expect(isValidCount(1.5)).toBe(false);
    expect(isValidCount(NaN)).toBe(false);
    expect(isValidCount(1e9)).toBe(false);
    expect(isValidCount(500)).toBe(true);
    expect(isValidCount(MAX_RUN_COUNT)).toBe(true);
  });

  it("a negative count no longer satisfies the budget or platform cap", () => {
    // Regression: projectedCost = perLead * -500 = -6.8, which trivially passed both `<=` checks.
    const est = estimate(mapsRoute, -500, 100);
    expect(est.projectedCost).toBeLessThan(0);
    expect(est.withinBudget).toBe(false);
    expect(withinPlatformCap(est.projectedCost)).toBe(false);
  });

  it("a real run still prices and passes within budget", () => {
    const est = estimate(mapsRoute, 500, 100);
    expect(est.projectedCost).toBeGreaterThan(0);
    expect(est.withinBudget).toBe(true);
  });
});
