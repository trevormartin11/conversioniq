import { describe, it, expect } from "vitest";
import { costUsd, pricingFor } from "@/lib/ai/pricing";
import { summarize, type AiUsageEvent } from "@/lib/ai/usage";

describe("ai pricing", () => {
  it("prices the premium (opus) tier higher than the fast (haiku) tier for identical usage", () => {
    const usage = { input: 1_000_000, output: 1_000_000 };
    const opus = costUsd("claude-opus-4-8", usage);
    const haiku = costUsd("claude-haiku-4-5-20251001", usage);
    expect(opus).toBeGreaterThan(haiku);
    // opus = 15 + 75 = $90 per 1M in + 1M out
    expect(opus).toBeCloseTo(90, 6);
    // haiku = 1 + 5 = $6
    expect(haiku).toBeCloseTo(6, 6);
  });

  it("falls back to the premium tier for an unknown model (never under-reports)", () => {
    expect(pricingFor("some-future-model")).toEqual(pricingFor("claude-opus-4-8"));
  });

  it("never returns a negative cost", () => {
    expect(costUsd("claude-haiku-4-5-20251001", { input: 0, output: 0 })).toBe(0);
  });
});

describe("ai spend summary aggregation", () => {
  const now = Date.parse("2026-06-15T12:00:00.000Z");
  const ev = (iso: string, costUsdValue: number, purpose: AiUsageEvent["purpose"], model = "claude-haiku-4-5-20251001"): AiUsageEvent => ({
    id: iso,
    createdAt: iso,
    model,
    purpose,
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: costUsdValue,
  });

  it("buckets spend into 24h / 7d / month-to-date windows", () => {
    const events: AiUsageEvent[] = [
      ev("2026-06-15T11:00:00.000Z", 1, "classification"), // within 24h
      ev("2026-06-12T12:00:00.000Z", 2, "drafting"), // within 7d, not 24h
      ev("2026-06-02T12:00:00.000Z", 4, "strategy"), // within month, not 7d
      ev("2026-05-30T12:00:00.000Z", 8, "copy"), // last month — excluded from MTD
    ];
    const s = summarize(events, now, "live", false);
    expect(s.last24hUsd).toBeCloseTo(1, 6);
    expect(s.last7dUsd).toBeCloseTo(3, 6); // 1 + 2
    expect(s.monthToDateUsd).toBeCloseTo(7, 6); // 1 + 2 + 4 (May excluded)
    expect(s.mtdCalls).toBe(3);
    expect(s.lastCallAt).toBe("2026-06-15T11:00:00.000Z");
    expect(s.available).toBe(true);
  });

  it("breaks MTD spend down by purpose, largest first", () => {
    const events: AiUsageEvent[] = [
      ev("2026-06-10T12:00:00.000Z", 1, "classification"),
      ev("2026-06-10T12:00:00.000Z", 5, "strategy"),
      ev("2026-06-11T12:00:00.000Z", 1, "classification"),
    ];
    const s = summarize(events, now, "live", false);
    expect(s.byPurpose[0]).toMatchObject({ key: "strategy", usd: 5, calls: 1 });
    expect(s.byPurpose[1]).toMatchObject({ key: "classification", usd: 2, calls: 2 });
  });

  it("reports unavailable when there are no events", () => {
    const s = summarize([], now, "mock", false);
    expect(s.available).toBe(false);
    expect(s.monthToDateUsd).toBe(0);
    expect(s.lastCallAt).toBeNull();
  });
});
