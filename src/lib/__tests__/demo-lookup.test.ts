import { describe, it, expect, beforeAll } from "vitest";
import { ensureData, getDemos, getLead, getOpenDemoByEmail } from "@/lib/data/store";

beforeAll(async () => {
  await ensureData();
});

describe("getOpenDemoByEmail", () => {
  it("returns undefined for empty, blank, or unknown email", () => {
    expect(getOpenDemoByEmail("")).toBeUndefined();
    expect(getOpenDemoByEmail("   ")).toBeUndefined();
    expect(getOpenDemoByEmail("definitely-not-a-real-lead@nowhere.invalid")).toBeUndefined();
  });

  it("matches an open demo by its lead's email, case-insensitively", () => {
    // Round-trip via the seed: take any open demo, look it up by its lead's email.
    const open = getDemos().find((d) => d.status !== "closed" && d.status !== "lost");
    expect(open).toBeTruthy();
    const lead = getLead(open!.leadId);
    expect(lead).toBeTruthy();
    if (!lead?.email) return; // seed lead without an email — nothing to assert

    const found = getOpenDemoByEmail(lead.email.toUpperCase());
    expect(found).toBeTruthy();
    expect(found!.leadId).toBe(lead.id);
    expect(["booked", "showed", "no_show"]).toContain(found!.status);
  });

  it("never returns a terminal (closed/lost) demo", () => {
    // For a lead whose demos are all terminal, the lookup must yield nothing.
    const byLead = new Map<string, ReturnType<typeof getDemos>>();
    for (const d of getDemos()) {
      const arr = byLead.get(d.leadId) ?? [];
      arr.push(d);
      byLead.set(d.leadId, arr);
    }
    const terminalOnly = [...byLead.entries()].find(([, ds]) => ds.every((d) => d.status === "closed" || d.status === "lost"));
    if (!terminalOnly) return; // seed has no such lead — skip
    const lead = getLead(terminalOnly[0]);
    if (!lead?.email) return;
    expect(getOpenDemoByEmail(lead.email)).toBeUndefined();
  });
});
