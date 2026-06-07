import { describe, it, expect } from "vitest";
import { costDashboard } from "@/lib/data/queries";

// Headline KPIs for the Costs page (mock-mode seed). Hybrid basis: recurring spend amortized
// to monthly; Claude billed dollars passed in by the caller and rolled into variable.
describe("costDashboard", () => {
  it("rolls Claude spend into variable and keeps total = fixed + variable", () => {
    const a = costDashboard({ monthlyUsd: 0 });
    const b = costDashboard({ monthlyUsd: 100 });
    expect(b.claudeMonthly).toBe(100);
    expect(b.variableMonthly).toBeCloseTo(a.variableMonthly + 100, 5); // Claude is variable
    expect(b.fixedMonthly).toBe(a.fixedMonthly); // fixed is unaffected by Claude usage
    expect(b.totalMonthly).toBeCloseTo(b.fixedMonthly + b.variableMonthly, 5);
  });

  it("computes net revenue as gross residual minus total spend", () => {
    const d = costDashboard({ monthlyUsd: 25 });
    expect(d.netRevenueMonthly).toBeCloseTo(d.revenueMonthly - d.totalMonthly, 5);
    expect(d.fixedMonthly).toBeGreaterThanOrEqual(0);
    expect(d.variableMonthly).toBeGreaterThanOrEqual(25);
  });

  it("variable cost-per-lead is null when no leads were sourced in the last 30 days, else positive", () => {
    const d = costDashboard({ monthlyUsd: 50 });
    if (d.leadsSourced30d === 0) expect(d.costPerLead).toBeNull();
    else expect(d.costPerLead!).toBeGreaterThan(0);
    // a trend direction only exists when both 30d windows have leads
    expect(["up", "down", "flat", null]).toContain(d.costPerLeadTrend);
  });
});
