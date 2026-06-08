import { describe, it, expect } from "vitest";
import { cloneCampaign, deleteCampaign, ensureData, getCampaign, getCampaigns, getVariants } from "@/lib/data/store";

describe("deleteCampaign — remove a campaign and its sequence", () => {
  it("removes the campaign and all of its variants", async () => {
    await ensureData();
    const src = getCampaigns()[0];
    expect(src).toBeTruthy();
    // Clone first so the test never destroys seed fixtures other tests rely on.
    const clone = await cloneCampaign(src.id, "Trevor");
    expect(clone).toBeTruthy();
    expect(getVariants().some((v) => v.campaignId === clone!.id)).toBe(true);

    const removed = await deleteCampaign(clone!.id, "Trevor");
    expect(removed?.id).toBe(clone!.id);
    expect(getCampaign(clone!.id)).toBeNull();
    expect(getVariants().some((v) => v.campaignId === clone!.id)).toBe(false);
  });

  it("returns null for an unknown campaign", async () => {
    await ensureData();
    expect(await deleteCampaign("c_does_not_exist", "Trevor")).toBeNull();
  });
});
