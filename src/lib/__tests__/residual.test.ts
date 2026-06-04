import { describe, it, expect } from "vitest";
import { residual } from "@/lib/data/queries";
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
