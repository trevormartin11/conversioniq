import { describe, it, expect } from "vitest";
import { buildLaunchChecklist, checklistReady, type ChecklistItem } from "@/lib/campaigns/launch-checklist";
import type { Campaign, Inbox, LandingPage, SequenceVariant } from "@/lib/data/types";

const campaign: Campaign = {
  id: "c_1", name: "Test", vertical: "Med Spa", personaId: "pe_1", status: "draft",
  instantlyCampaignId: "inst_1", listVersion: "v1", inboxIds: ["ib_1"], dailyCap: 30, createdAt: "2026-01-01",
};
const inbox: Inbox = {
  id: "ib_1", email: "a@x.com", domainId: "d1", personaId: "pe_1", instantlyAccountId: null,
  warmupScore: 95, status: "active", dailyCap: 40, sentToday: 0, bounceRate: 0, spamComplaints: 0, lastSyncedAt: null,
};
const variant = (over: Partial<SequenceVariant>): SequenceVariant => ({
  id: "sv_1", campaignId: "c_1", step: 1, variant: "A",
  subject: "quick question", body: "{{personalization}}\n\nHi — reply STOP or just say no thanks to opt out.",
  sent: 0, opens: 0, replies: 0, positives: 0, approved: true, ...over,
});
const publishedLanding = {
  id: "lp_1", campaignId: "c_1", vertical: "Med Spa", domain: "x.com", status: "published",
  content: {} as LandingPage["content"], schedulerUrl: null, videoUrl: null,
  publishedUrl: "https://go.x.com", source: "ai", createdAt: "", updatedAt: "",
  approvedBy: "T", approvedAt: "", publishedAt: "", note: null,
} as LandingPage;

const base = {
  campaign, variants: [variant({})], leads: [], landing: publishedLanding,
  inboxes: [inbox], instantlyConnected: true, warmupGate: 80,
};
const item = (items: ChecklistItem[], key: string) => items.find((i) => i.key === key);

describe("buildLaunchChecklist — the final gate before sending", () => {
  it("passes a fully-ready campaign and demands the two manual sign-offs", () => {
    const items = buildLaunchChecklist(base);
    expect(item(items, "sending")?.status).toBe("pass");
    expect(item(items, "sequence")?.status).toBe("pass");
    expect(item(items, "personalization")?.status).toBe("pass");
    expect(item(items, "personalization_test")?.manual).toBe(true); // the blank-render test send
    expect(item(items, "landing")?.status).toBe("pass");
    expect(item(items, "landing_review")?.manual).toBe(true);
    expect(item(items, "optout")?.status).toBe("pass");
    expect(item(items, "caps")?.status).toBe("pass");

    // Launch only enables once every manual box is ticked.
    expect(checklistReady(items, new Set())).toBe(false);
    expect(checklistReady(items, new Set(["personalization_test", "landing_review"]))).toBe(true);
  });

  it("blocks (fail) when the campaign cannot actually send", () => {
    const items = buildLaunchChecklist({ ...base, campaign: { ...campaign, instantlyCampaignId: null } });
    expect(item(items, "sending")?.status).toBe("fail");
    expect(checklistReady(items, new Set(["personalization_test", "landing_review"]))).toBe(false);
  });

  it("warns (not blocks) on missing personalization, unpublished landing page, and missing opt-out", () => {
    const items = buildLaunchChecklist({
      ...base,
      variants: [variant({ body: "Hi there, plain body with no tag and no escape hatch." })],
      landing: { ...publishedLanding, status: "approved", publishedUrl: null },
    });
    expect(item(items, "personalization")?.status).toBe("warn");
    expect(item(items, "personalization_test")).toBeUndefined(); // no tag → no test to run
    expect(item(items, "landing")?.status).toBe("warn");
    expect(item(items, "landing_skip")?.manual).toBe(true); // launching without a page is an explicit choice
    expect(item(items, "optout")?.status).toBe("warn");
    expect(checklistReady(items, new Set(["landing_skip"]))).toBe(true); // warns don't block once signed off
  });

  it("fails on incomplete sequence copy and warns when the campaign cap exceeds inbox capacity", () => {
    const items = buildLaunchChecklist({
      ...base,
      campaign: { ...campaign, dailyCap: 100 },
      variants: [variant({}), variant({ id: "sv_2", step: 2, subject: "", body: "follow up" })],
    });
    expect(item(items, "sequence")?.status).toBe("fail");
    expect(item(items, "caps")?.status).toBe("warn");
  });
});
