import { describe, it, expect } from "vitest";
import { projection } from "@/lib/data/queries";
import { appConfig } from "@/lib/config";

describe("projection — forward residual from operator assumptions", () => {
  it("derives monthly closes / new MRR / residual from the goal, close rate and assumed MRR", () => {
    const p = projection();
    expect(p.monthlyDemos).toBe(appConfig.goals.demosPerDay * 30);
    expect(p.monthlyCloses).toBeCloseTo(p.monthlyDemos * appConfig.projection.assumedCloseRate, 6);
    expect(p.newMrrPerMonth).toBeCloseTo(p.monthlyCloses * appConfig.projection.assumedMonthlyMrr, 6);
    expect(p.grossResidualAddedMonthly).toBeCloseTo(p.newMrrPerMonth * appConfig.residual.grossRate, 6);
    expect(p.personalResidualAddedMonthly).toBeCloseTo(p.newMrrPerMonth * appConfig.residual.personalRate, 6);
  });
});
