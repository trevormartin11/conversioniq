import { describe, it, expect } from "vitest";
import { launchBlocker } from "@/lib/campaigns/launch-gate";
import type { Campaign, Inbox } from "@/lib/data/types";

const base: Campaign = {
  id: "c_1", name: "Test", vertical: "Med Spa", personaId: "pe_1", status: "draft",
  instantlyCampaignId: null, listVersion: "v1", inboxIds: [], dailyCap: 80, createdAt: "2026-01-01",
};
const inbox = (over: Partial<Inbox>): Inbox => ({
  id: "ib_1", email: "a@x.com", domainId: "d1", personaId: "pe_1", instantlyAccountId: null,
  warmupScore: 90, status: "active", dailyCap: 30, sentToday: 0, bounceRate: 0, spamComplaints: 0, lastSyncedAt: null,
  ...over,
});
const opts = (over: Partial<Parameters<typeof launchBlocker>[1]>) => ({ instantlyConnected: true, warmupGate: 80, inboxes: [], ...over });

describe("launchBlocker", () => {
  it("blocks an un-pushed campaign when Instantly is connected", () => {
    expect(launchBlocker(base, opts({}))?.reason).toBe("not_live");
  });

  it("blocks a linked campaign with no inboxes assigned", () => {
    expect(launchBlocker({ ...base, instantlyCampaignId: "x" }, opts({}))?.reason).toBe("no_inboxes");
  });

  it("blocks when an assigned inbox is under warmup", () => {
    const c = { ...base, instantlyCampaignId: "x", inboxIds: ["ib_1"] };
    expect(launchBlocker(c, opts({ inboxes: [inbox({ warmupScore: 50 })] }))?.reason).toBe("warmup");
  });

  it("allows a linked campaign with a warmed, active inbox", () => {
    const c = { ...base, instantlyCampaignId: "x", inboxIds: ["ib_1"] };
    expect(launchBlocker(c, opts({ inboxes: [inbox({})] }))).toBeNull();
  });

  it("does not enforce the live-sender rules in mock/preview mode", () => {
    // no Instantly link, no inboxes — but no live sender, so sends simulate and launch is allowed
    expect(launchBlocker(base, opts({ instantlyConnected: false }))).toBeNull();
  });

  it("blocks (fail closed) when an assigned inbox id no longer resolves to a hub inbox", () => {
    // Regression: an empty/under-resolved inbox list let the warmup guard evaporate while
    // inboxIds.length still satisfied the no_inboxes check — launching from ghosts.
    const c = { ...base, instantlyCampaignId: "x", inboxIds: ["ib_gone_1", "ib_gone_2"] };
    expect(launchBlocker(c, opts({ inboxes: [] }))?.reason).toBe("warmup");
  });
});
