import { describe, it, expect } from "vitest";
import { aggregateCost, type CostBucket } from "@/lib/integrations/anthropic-admin";

// cost_report `amount` is in CENTS as a decimal string — aggregateCost must divide by 100.
describe("actual cost aggregation (Anthropic Cost Report)", () => {
  const now = Date.parse("2026-06-15T12:00:00.000Z");

  const buckets: CostBucket[] = [
    {
      starting_at: "2026-06-15T00:00:00Z", // today (UTC)
      results: [
        { amount: "1000", model: "claude-opus-4-8", workspace_id: "wrkspc_app" }, // $10.00
        { amount: "200", model: "claude-haiku-4-5-20251001", workspace_id: "wrkspc_app" }, // $2.00
        { amount: "5000", model: "claude-opus-4-8", workspace_id: "wrkspc_other" }, // $50 — different app
      ],
    },
    {
      starting_at: "2026-06-10T00:00:00Z", // within 7d window
      results: [{ amount: "300", model: "claude-opus-4-8", workspace_id: "wrkspc_app" }], // $3.00
    },
    {
      starting_at: "2026-06-02T00:00:00Z", // MTD but older than 7d
      results: [{ amount: "400", model: "claude-haiku-4-5-20251001", workspace_id: "wrkspc_app" }], // $4.00
    },
  ];

  it("converts cents→USD and totals month-to-date for the org (no workspace filter)", () => {
    const a = aggregateCost(buckets, now, null);
    // 10 + 2 + 50 + 3 + 4
    expect(a.monthToDateUsd).toBeCloseTo(69, 6);
    expect(a.todayUsd).toBeCloseTo(62, 6); // 10 + 2 + 50
    expect(a.last7dUsd).toBeCloseTo(65, 6); // today (62) + Jun 10 (3)
  });

  it("scopes to one workspace, excluding other apps' spend on the same org", () => {
    const a = aggregateCost(buckets, now, "wrkspc_app");
    // only wrkspc_app: 10 + 2 + 3 + 4 (the $50 other-app row is excluded)
    expect(a.monthToDateUsd).toBeCloseTo(19, 6);
    expect(a.todayUsd).toBeCloseTo(12, 6);
    const opus = a.byModelUsd.find((m) => m.model === "claude-opus-4-8");
    const haiku = a.byModelUsd.find((m) => m.model === "claude-haiku-4-5-20251001");
    expect(opus?.usd).toBeCloseTo(13, 6); // 10 + 3
    expect(haiku?.usd).toBeCloseTo(6, 6); // 2 + 4
  });

  it("returns empty totals for no data", () => {
    const a = aggregateCost([], now, null);
    expect(a.monthToDateUsd).toBe(0);
    expect(a.byModelUsd).toEqual([]);
    expect(a.byDayUsd).toEqual([]);
  });
});
