import { describe, it, expect } from "vitest";
import { approveLandingPage, generateLandingPage, getCampaigns, getLandingPage, updateLandingContent } from "@/lib/data/store";

// One landing page per campaign; generate → sign-off → edit-drops-to-draft (mock mode seed).
describe("landing page store", () => {
  it("generates a draft page for a campaign, then approves it", async () => {
    const campaignId = getCampaigns()[0].id;
    const p = await generateLandingPage(campaignId, "Tester");
    expect(p).not.toBeNull();
    expect(p!.status).toBe("draft");
    expect(p!.campaignId).toBe(campaignId);
    expect(p!.content.hero.headline).toBeTruthy();
    expect(p!.content.features.length).toBeGreaterThanOrEqual(3);
    expect(getLandingPage(campaignId)?.id).toBe(p!.id);

    const ap = await approveLandingPage(campaignId, "Tester");
    expect(ap!.status).toBe("approved");
    expect(ap!.approvedBy).toBe("Tester");
  });

  it("editing approved copy drops it back to draft", async () => {
    const campaignId = getCampaigns()[0].id;
    const p = getLandingPage(campaignId)!;
    const edited = await updateLandingContent(campaignId, { ...p.content, formIntro: "Edited." }, "Tester");
    expect(edited!.status).toBe("draft");
    expect(edited!.approvedBy).toBeNull();
  });

  it("regenerating reuses the same row (one page per campaign)", async () => {
    const campaignId = getCampaigns()[0].id;
    const a = await generateLandingPage(campaignId, "Tester");
    const b = await generateLandingPage(campaignId, "Tester");
    expect(b!.id).toBe(a!.id);
  });
});
