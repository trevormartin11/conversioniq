import { describe, it, expect } from "vitest";
import { campaignCapacity } from "@/lib/data/queries";
import { ensureData } from "@/lib/data/store";

describe("campaignCapacity — throughput vs warmed-inbox capacity", () => {
  it("computes a coherent plan for the seeded campaign", async () => {
    await ensureData();
    const cap = campaignCapacity("c_medspa");
    expect(cap).toBeTruthy();
    // effective capacity never exceeds the campaign cap, and is bounded by warmed inboxes
    expect(cap!.dailyCapacity).toBeLessThanOrEqual(cap!.campaignCap);
    expect(cap!.dailyCapacity).toBeLessThanOrEqual(cap!.potentialDaily);
    expect(cap!.warmed).toBeGreaterThan(0);
    // days-to-first-touch is consistent with the awaiting count and capacity
    if (cap!.dailyCapacity > 0) {
      expect(cap!.daysToFirstTouch).toBe(Math.ceil(cap!.awaitingFirstTouch / cap!.dailyCapacity));
    }
  });

  it("returns null for an unknown campaign", async () => {
    await ensureData();
    expect(campaignCapacity("nope")).toBeNull();
  });
});
