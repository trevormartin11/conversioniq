import { describe, it, expect } from "vitest";
import { resolveInboxId } from "@/lib/sync/inboxes";

describe("resolveInboxId — collision-free, migration-safe inbox identity", () => {
  it("keeps whatever id an existing email already has (no row churn on resync)", () => {
    const idByEmail = new Map([["jon.smith@x.com", "ib_legacy_scheme_123"]]);
    expect(resolveInboxId("Jon.Smith@x.com", idByEmail, new Set(["ib_legacy_scheme_123"]))).toBe("ib_legacy_scheme_123");
  });

  it("gives slug-colliding emails DISTINCT ids instead of silently merging them", () => {
    // jon.smith@ and jon-smith@ both slug to ib_jon_smith_x_com — the second used to clobber
    // the first row (lost warmup/status) because the upsert conflict key was the id.
    const idByEmail = new Map<string, string>();
    const taken = new Set<string>();
    const a = resolveInboxId("jon.smith@x.com", idByEmail, taken);
    taken.add(a);
    const b = resolveInboxId("jon-smith@x.com", idByEmail, taken);
    expect(a).toBe("ib_jon_smith_x_com");
    expect(b).not.toBe(a);
    expect(b.startsWith("ib_jon_smith_x_com_")).toBe(true);
  });

  it("is deterministic — reruns converge on the same suffixed id", () => {
    const taken = new Set(["ib_jon_smith_x_com"]);
    const first = resolveInboxId("jon+smith@x.com", new Map(), taken);
    const second = resolveInboxId("jon+smith@x.com", new Map(), taken);
    expect(first).toBe(second);
  });
});
