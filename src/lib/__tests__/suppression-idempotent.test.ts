import { describe, it, expect } from "vitest";
import { addSuppression, ensureData, getSuppression, isSuppressed } from "@/lib/data/store";

describe("addSuppression — deterministic identity, duplicate-as-success", () => {
  it("suppressing the same address twice converges on one row (no 23505 chain abort)", async () => {
    await ensureData();
    const entry = { email: "dupe-test@spa-example.com", domain: null, reason: "dnc" as const, source: "test", leadId: null, note: null };
    const first = await addSuppression(entry, "test");
    const second = await addSuppression(entry, "test");
    expect(second.id).toBe(first.id); // deterministic id from the identity, not Math.random
    expect(getSuppression().filter((s) => s.email === "dupe-test@spa-example.com")).toHaveLength(1);
    expect(isSuppressed("dupe-test@spa-example.com").suppressed).toBe(true);
  });
});
