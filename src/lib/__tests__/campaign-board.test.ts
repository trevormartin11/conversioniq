import { describe, it, expect } from "vitest";
import { campaignBoard } from "@/lib/data/queries";
import { ensureData, getCampaigns, getDemos, getLeads } from "@/lib/data/store";

describe("campaignBoard — per-campaign read model", () => {
  it("returns one card per campaign with internally consistent figures", async () => {
    await ensureData();
    const board = campaignBoard();
    expect(board.length).toBe(getCampaigns().length);

    for (const c of board) {
      // remaining is a subset of loaded; runway is set iff there's a remaining list to work
      expect(c.leadsRemaining).toBeLessThanOrEqual(c.leadsLoaded);
      expect(c.runwayDays === null).toBe(c.leadsRemaining === 0);
      // won demos are a subset of attributed demos; under-warmup inboxes a subset of assigned
      expect(c.demosWon).toBeLessThanOrEqual(c.demos);
      expect(c.inboxesUnderWarmup).toBeLessThanOrEqual(c.inboxCount);
      expect(c.warmupAvg).toBeGreaterThanOrEqual(0);
      expect(c.warmupAvg).toBeLessThanOrEqual(100);
    }
  });

  it("attributes leads and demos to the right campaign", async () => {
    await ensureData();
    const leads = getLeads();
    const demos = getDemos();
    const leadCampaign = new Map(leads.map((l) => [l.id, l.campaignId]));

    for (const c of campaignBoard()) {
      expect(c.leadsLoaded).toBe(leads.filter((l) => l.campaignId === c.id).length);
      expect(c.demos).toBe(demos.filter((d) => leadCampaign.get(d.leadId) === c.id).length);
    }
  });
});
