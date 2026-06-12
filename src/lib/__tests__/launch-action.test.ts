import { describe, it, expect, vi } from "vitest";

/**
 * Server-side launch enforcement — the mutation sweep found NO test exercised
 * launchCampaignAction itself, so the one boolean separating override:true from a hard-block
 * bypass (and the empty-copy guard) was unprotected. These lock both down at the action layer.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({ id: "u_test", name: "Test Operator", email: "t@x.com", role: "owner" as const, avatarColor: "#888" }),
}));
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, integrations: { ...actual.integrations, instantly: true } };
});
const activateCampaign = vi.fn(async () => ({}));
vi.mock("@/lib/integrations/instantly", () => ({
  activateCampaign: () => activateCampaign(),
  pauseCampaign: vi.fn(async () => ({})),
  addLeadsToCampaign: vi.fn(async () => ({ added: 0, failed: 0 })),
  createInstantlyCampaign: vi.fn(async () => ({ id: "x" })),
  deleteInstantlyCampaign: vi.fn(async () => ({})),
}));
vi.mock("@/lib/sync/campaigns", () => ({ syncCampaigns: vi.fn(async () => ({})) }));

import { launchCampaignAction } from "@/app/(dashboard)/campaigns/actions";
import { addCampaign, ensureData, getDataset, seedCampaignVariants } from "@/lib/data/store";

async function draftCampaign(steps: { step: number; subject: string; body: string }[]) {
  const c = await addCampaign({ name: "Launch Guard", vertical: "Med Spas", personaId: "pe_trevor", dailyCap: 80 }, "Test");
  if (steps.length) await seedCampaignVariants(c.id, steps, "Test");
  return c;
}

describe("launchCampaignAction — server-side gate (override can't forgive hard blocks)", () => {
  it("refuses a not-on-Instantly campaign even with override:true", async () => {
    await ensureData();
    const c = await draftCampaign([{ step: 1, subject: "s", body: "b" }]);
    const res = await launchCampaignAction(c.id, true); // override
    expect(res.ok).toBe(false);
    expect(!res.ok && res.blocked).toBe("not_live");
    expect(activateCampaign).not.toHaveBeenCalled();
  });

  it("refuses a linked campaign with no inboxes even with override:true", async () => {
    await ensureData();
    const c = await draftCampaign([{ step: 1, subject: "s", body: "b" }]);
    getDataset().campaigns.find((x) => x.id === c.id)!.instantlyCampaignId = "inst_x";
    const res = await launchCampaignAction(c.id, true);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.blocked).toBe("no_inboxes");
  });

  it("refuses launch when a sequence step has empty copy (server re-check, not UI-only)", async () => {
    await ensureData();
    const c = await draftCampaign([{ step: 1, subject: "s", body: "b" }]);
    const row = getDataset().campaigns.find((x) => x.id === c.id)!;
    row.instantlyCampaignId = "inst_y";
    row.inboxIds = getDataset().inboxes.slice(0, 1).map((i) => i.id);
    // Blank out the body to simulate broken copy.
    getDataset().variants.filter((v) => v.campaignId === c.id).forEach((v) => (v.body = "   "));
    const res = await launchCampaignAction(c.id, true);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.blocked).toBe("incomplete_copy");
    expect(activateCampaign).not.toHaveBeenCalled();
  });
});
