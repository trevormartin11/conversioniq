import { describe, it, expect } from "vitest";
import { residual, unitEconomics } from "@/lib/data/queries";
import { ensureData } from "@/lib/data/store";
import { appConfig } from "@/lib/config";

describe("residual math (20% recurring, split 3 ways)", () => {
  it("uses the right rates", () => {
    expect(appConfig.residual.grossRate).toBe(0.2);
    expect(appConfig.residual.splitWays).toBe(3);
    expect(appConfig.residual.personalRate).toBeCloseTo(0.0667, 4);
  });

  it("computes gross + personal from closed MRR", () => {
    const r = residual();
    // seed has two closed deals: $1200 + $900 = $2100 MRR
    expect(r.closedCount).toBe(2);
    expect(r.totalMrr).toBe(2100);
    expect(r.grossMonthly).toBeCloseTo(420, 5);
    expect(r.personalMonthly).toBeCloseTo(140, 5);
    expect(r.grossAnnual).toBeCloseTo(5040, 5);
  });
});

describe("unitEconomics — profitability math", () => {
  it("derives cost/demo, CAC, close rate and payback consistently", async () => {
    await ensureData();
    const e = unitEconomics();
    expect(e.investedToDate).toBeGreaterThan(0);
    expect(e.demosBooked).toBeGreaterThan(0);
    expect(e.closeRate).toBeCloseTo(e.closed / e.demosBooked, 5);
    if (e.costPerDemo != null) expect(e.costPerDemo).toBeCloseTo(e.investedToDate / e.demosBooked, 5);
    if (e.cac != null) expect(e.cac).toBeCloseTo(e.investedToDate / e.closed, 5);
    if (e.paybackMonths != null && e.grossPerAccountMonthly) {
      expect(e.paybackMonths).toBeCloseTo(e.cac! / e.grossPerAccountMonthly, 5);
    }
  });
});
