import { describe, it, expect, vi } from "vitest";

/**
 * The selective-hydration contract (the hydration-architecture rewrite, phase 1+2):
 *   - a surface declaring collections fetches ONLY those tables (+ one settings query);
 *   - within the TTL the same collection is not refetched (one request = one round-trip set,
 *     and getCurrentUser + an action body no longer cost two full hydrations);
 *   - reading an undeclared collection in live mode FAILS LOUD instead of silently
 *     returning [] (an "empty" suppression list or inbox fleet is how catastrophes start).
 */

const fetchCounts = new Map<string, number>();
vi.mock("@/lib/data/supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        order: () => chain,
        eq: () => chain,
        in: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        range: async () => {
          fetchCounts.set(table, (fetchCounts.get(table) ?? 0) + 1);
          return { data: [], error: null };
        },
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => {
          fetchCounts.set(table, (fetchCounts.get(table) ?? 0) + 1);
          return resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  }),
  chunkedUpsert: vi.fn(),
}));
vi.mock("@/lib/config", async (orig) => {
  const actual = await orig<typeof import("@/lib/config")>();
  return { ...actual, DATA_MODE: "live" as const, integrations: { ...actual.integrations, supabase: true } };
});

import { ensureData, getLeads, getInboxes, getSuppression } from "@/lib/data/store";

describe("selective hydration — live mode", () => {
  it("fetches only the declared collections (+settings), TTL-dedupes, and fails loud on undeclared reads", async () => {
    // 1) Declare leads + suppression: exactly those tables + settings are fetched.
    await ensureData(["leads", "suppression"]);
    expect(fetchCounts.get("leads")).toBe(1);
    expect(fetchCounts.get("suppression")).toBe(1);
    expect(fetchCounts.get("settings")).toBe(1);
    expect(fetchCounts.has("inboxes")).toBe(false); // not declared → not fetched
    expect(fetchCounts.has("replies")).toBe(false);

    // 2) Declared getters work; an UNDECLARED getter throws (never a silent []).
    expect(getLeads()).toEqual([]);
    expect(getSuppression()).toEqual([]);
    expect(() => getInboxes()).toThrow(/read before hydration/);

    // 3) Within the TTL the same declaration is a no-op — no second round-trip.
    await ensureData(["leads", "suppression"]);
    expect(fetchCounts.get("leads")).toBe(1);
    expect(fetchCounts.get("settings")).toBe(1);

    // 4) A wider declaration fetches only the missing collections.
    await ensureData(["leads", "inboxes"]);
    expect(fetchCounts.get("leads")).toBe(1); // still fresh
    expect(fetchCounts.get("inboxes")).toBe(1); // newly hydrated
    expect(() => getInboxes()).not.toThrow();
  });
});
