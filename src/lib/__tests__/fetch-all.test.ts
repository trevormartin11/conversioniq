import { describe, it, expect, vi } from "vitest";

/**
 * Contract tests for the hydration read path (today's prod-bug class lived exactly here):
 * fetchAll must paginate past PostgREST's 1,000-row cap, tolerate ONLY a missing table
 * (42P01) as empty, and THROW on any other error — a transient Supabase failure must not
 * hydrate an empty suppression universe that the DNC gate then waves through.
 */

type Resp = { data: Record<string, unknown>[] | null; error: { code?: string; message: string } | null };
const state: { pages: Resp[]; calls: { from: number; to: number }[] } = { pages: [], calls: [] };

vi.mock("@/lib/data/supabase", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => {
        const q = {
          order: () => q,
          range: async (from: number, to: number) => {
            state.calls.push({ from, to });
            return state.pages.shift() ?? { data: [], error: null };
          },
        };
        return q;
      },
    }),
  }),
  chunkedUpsert: vi.fn(),
}));

import { fetchAll } from "@/lib/data/live";

const rows = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({ id: `r_${offset + i}` }));

describe("fetchAll — paginated, fail-closed hydration reads", () => {
  it("paginates past the 1,000-row page cap and concatenates all pages", async () => {
    state.pages = [
      { data: rows(1000), error: null },
      { data: rows(1000, 1000), error: null },
      { data: rows(7, 2000), error: null },
    ];
    state.calls = [];
    const all = await fetchAll("suppression");
    expect(all).toHaveLength(2007); // the old single .limit(5000) read was clamped to 1,000
    expect(state.calls).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
      { from: 2000, to: 2999 },
    ]);
  });

  it("treats ONLY an undefined table (42P01 — migration not applied yet) as empty", async () => {
    state.pages = [{ data: null, error: { code: "42P01", message: 'relation "costs" does not exist' } }];
    expect(await fetchAll("costs")).toEqual([]);
  });

  it("THROWS on any other error instead of hydrating an empty universe", async () => {
    state.pages = [{ data: null, error: { code: "57014", message: "timeout" } }];
    await expect(fetchAll("suppression")).rejects.toThrow(/hydration failed for suppression/);
  });
});
