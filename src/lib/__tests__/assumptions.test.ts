import { describe, it, expect } from "vitest";
import { getAssumptions, setAssumptions } from "@/lib/data/store";
import { projection } from "@/lib/data/queries";
import { appConfig } from "@/lib/config";

describe("operator-set economic assumptions", () => {
  it("defaults to the appConfig projection values", () => {
    expect(getAssumptions()).toEqual({
      closeRate: appConfig.projection.assumedCloseRate,
      monthlyMrr: appConfig.projection.assumedMonthlyMrr,
    });
  });

  it("setAssumptions updates them and the projection reflects the new numbers", async () => {
    await setAssumptions({ closeRate: 0.4, monthlyMrr: 1000 });
    expect(getAssumptions()).toEqual({ closeRate: 0.4, monthlyMrr: 1000 });
    const p = projection();
    expect(p.assumedCloseRate).toBe(0.4);
    expect(p.assumedMonthlyMrr).toBe(1000);
    expect(p.newMrrPerMonth).toBeCloseTo(p.monthlyDemos * 0.4 * 1000, 6);
  });

  it("clamps close rate to 0..1 and floors MRR at 0", async () => {
    await setAssumptions({ closeRate: 1.5, monthlyMrr: -50 });
    expect(getAssumptions().closeRate).toBe(1);
    expect(getAssumptions().monthlyMrr).toBe(0);
  });
});
