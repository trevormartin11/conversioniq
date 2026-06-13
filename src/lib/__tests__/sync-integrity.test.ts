import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The invariant sweep's headline finding: the live data-sync layer (syncCampaigns,
 * syncVariantMetrics) never executes under the mock-mode test suite, so its integrity guards —
 * the insert/update split, the NOT-NULL echo, the empty-list prune guard, update-only metrics —
 * were unprotected against regression (mutations passed silently). This faked-Supabase harness
 * runs the REAL sync code and asserts each guard, the same technique sync-replies.test.ts uses.
 */

// ---- recording fake Supabase -------------------------------------------------
type Row = Record<string, unknown>;
const dbState = {
  tables: new Map<string, Row[]>(),
  upserts: [] as { table: string; rows: Row[] }[],
  updates: [] as { table: string; patch: Row }[],
  deletes: [] as { table: string }[],
};
function fakeFrom(table: string) {
  const rows = () => dbState.tables.get(table) ?? [];
  const builder = {
    _filtered: null as Row[] | null,
    select(cols: string) {
      const fields = cols.split(",").map((c) => c.trim().split(" ")[0]);
      const project = () => (this._filtered ?? rows()).map((r) => Object.fromEntries(fields.map((f) => [f, r[f]])));
      // Thenable so `await db.from(t).select(c)` and `.not(...)` both resolve.
      return {
        not: (_col: string, _op: string, _v: unknown) => Promise.resolve({ data: project(), error: null }),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: project(), error: null }),
      };
    },
    update(patch: Row) {
      return {
        eq: async (_c: string, _v: unknown) => { dbState.updates.push({ table, patch }); return { error: null }; },
        in: async (_c: string, _vals: unknown[]) => { dbState.updates.push({ table, patch }); return { error: null }; },
      };
    },
    delete() {
      return { in: async (_c: string, _vals: unknown[]) => { dbState.deletes.push({ table }); return { error: null }; } };
    },
  };
  return builder;
}
vi.mock("@/lib/data/supabase", () => ({
  supabaseAdmin: () => ({ from: fakeFrom }),
  chunkedUpsert: async (table: string, rows: Row[]) => { dbState.upserts.push({ table, rows }); return rows.length; },
}));

// ---- fake Instantly ----------------------------------------------------------
const instantly = { campaigns: [] as Record<string, unknown>[], stepAnalytics: [] as Record<string, unknown>[] };
vi.mock("@/lib/integrations/instantly", () => ({
  listAllCampaigns: async () => instantly.campaigns,
  getCampaignStepAnalytics: async () => instantly.stepAnalytics,
}));
vi.mock("@/lib/utils", async (orig) => ({ ...(await orig<typeof import("@/lib/utils")>()) }));

import { syncCampaigns } from "@/lib/sync/campaigns";
import { syncVariantMetrics } from "@/lib/sync/variant-metrics";

function reset() {
  dbState.tables = new Map();
  dbState.upserts = [];
  dbState.updates = [];
  dbState.deletes = [];
  instantly.campaigns = [];
  instantly.stepAnalytics = [];
}
const upsertRows = (table: string) => dbState.upserts.filter((u) => u.table === table).flatMap((u) => u.rows);

describe("syncCampaigns — insert/update split preserves hub-owned attribution", () => {
  beforeEach(reset);

  it("an EXISTING campaign takes the UPDATE path WITH its NOT-NULL vertical/persona echoed (never re-derived)", async () => {
    dbState.tables.set("campaigns", [{ id: "c_99", created_at: "2026-01-01", vertical: "Med Spa", persona_id: "pe_trevor" }]);
    dbState.tables.set("sequence_variants", []);
    instantly.campaigns = [{ id: "99", name: "Home Services blast", status: 1, email_list: [], sequences: [] }];

    await syncCampaigns();
    const camps = upsertRows("campaigns");
    const row = camps.find((r) => r.id === "c_99")!;
    // NOT-NULL echo: vertical present (so the upsert insert-tuple can't abort) AND unchanged
    // (NOT re-derived to "Home Services" from the name) — mutation #7's exact failure.
    expect(row.vertical).toBe("Med Spa");
    expect(row.persona_id).toBe("pe_trevor");
    // An update payload must NOT carry created_at/list_version (those are insert-only).
    expect(row).not.toHaveProperty("created_at");
  });

  it("a NEW campaign takes the INSERT path WITH derived vertical + created_at", async () => {
    dbState.tables.set("campaigns", []);
    dbState.tables.set("sequence_variants", []);
    instantly.campaigns = [{ id: "100", name: "Dental outreach", status: 0, email_list: [], sequences: [] }];

    await syncCampaigns();
    const row = upsertRows("campaigns").find((r) => r.id === "c_100")!;
    expect(row.vertical).toBe("Dental");
    expect(row).toHaveProperty("created_at");
    expect(row).toHaveProperty("list_version", "instantly");
  });

  it("existing variants UPDATE without their counters (sent/opens stay untouched)", async () => {
    dbState.tables.set("campaigns", [{ id: "c_5", created_at: "2026-01-01", vertical: "Med Spa", persona_id: "pe_jon" }]);
    dbState.tables.set("sequence_variants", [{ id: "sv_5_0_0" }]);
    instantly.campaigns = [{ id: "5", name: "x", status: 1, email_list: [], sequences: [{ steps: [{ variants: [{ subject: "new subj", body: "b" }] }] }] }];

    await syncCampaigns();
    const v = upsertRows("sequence_variants").find((r) => r.id === "sv_5_0_0")!;
    expect(v.subject).toBe("new subj");
    expect(v).not.toHaveProperty("sent"); // counters never overwritten on the update path
  });

  it("an EMPTY Instantly response prunes NOTHING (the wipe guard) — mutation #8", async () => {
    dbState.tables.set("campaigns", [{ id: "c_old", created_at: "2020-01-01", instantly_campaign_id: "old" }]);
    dbState.tables.set("sequence_variants", []);
    instantly.campaigns = []; // transient empty list must never wipe the hub

    const res = await syncCampaigns();
    expect(res.pruned).toBe(0);
    expect(dbState.deletes).toHaveLength(0);
  });
});

describe("syncVariantMetrics — update-only, drift-visible", () => {
  beforeEach(reset);

  it("only UPDATEs variant ids the hub already knows (never inserts), and counts unmatched drift — mutation #10", async () => {
    dbState.tables.set("campaigns", [{ id: "c_7", instantly_campaign_id: "7" }]);
    dbState.tables.set("sequence_variants", [{ id: "sv_7_0_0" }]); // hub knows slot A only
    // Live-verified shape: ZERO-based digit-string step/variant (see variant-metrics.ts).
    instantly.stepAnalytics = [
      { step: "0", variant: "0", sent: 120, opened: 40, replies: 6 }, // → sv_7_0_0 (known)
      { step: "0", variant: "1", sent: 118, opened: 22, replies: 3 }, // → sv_7_0_1 (UNKNOWN → unmatched)
    ];

    const res = await syncVariantMetrics();
    expect(res.variants).toBe(1); // only the known slot updated
    expect(res.unmatched).toBe(1); // the unknown slot surfaces as drift, never inserted
    expect(dbState.updates.filter((u) => u.table === "sequence_variants")).toHaveLength(1);
  });
});
