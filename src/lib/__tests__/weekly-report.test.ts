import { describe, it, expect } from "vitest";
import { ensureData } from "@/lib/data/store";
import { buildWeeklyReport } from "@/lib/jobs/digest";

describe("buildWeeklyReport — decision-driving weekly digest", () => {
  it("includes demos, economics, residual, costs, and deliverability", async () => {
    await ensureData();
    const r = buildWeeklyReport();
    expect(r).toContain("Weekly Report");
    expect(r).toContain("Demos:");
    expect(r).toContain("Economics:");
    expect(r).toContain("CAC");
    expect(r).toContain("Residual:");
    expect(r).toContain("Costs:");
    expect(r).toContain("Inboxes:");
  });
});
