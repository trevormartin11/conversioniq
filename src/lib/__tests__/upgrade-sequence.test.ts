import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Caught by the LIVE pre-launch sweep: upgradeSequenceAction pushed the
 * {{personalization}} opener + A/B subjects to Instantly but never mirrored them into
 * the hub's variant rows — the launch checklist reported "no opener" against a live
 * sequence that had one, variant-metrics couldn't match the new B arm, and a later
 * "Push copy to Instantly" would CLOBBER the upgraded live copy with the stale hub
 * version. The mirror is syncCampaigns() (the same path that owns the canonical
 * sv_<instId>_<step0>_<v0> rows), run ONLY after the Instantly push succeeds.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({ id: "u_test", name: "Test Operator", email: "t@ciq.local", role: "owner" as const, avatarColor: "#888" }),
}));
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, integrations: { ...actual.integrations, instantly: true } };
});
vi.mock("@/lib/integrations/instantly", () => ({
  updateInstantlyCampaignSequence: vi.fn(async () => ({})),
}));
vi.mock("@/lib/sync/campaigns", () => ({ syncCampaigns: vi.fn(async () => ({})) }));
vi.mock("@/lib/ai/copy", () => ({
  rewriteCopy: vi.fn(async (input: { subject: string }) => ({ source: "ai" as const, subject: `alt: ${input.subject}`, body: "" })),
}));

import { upgradeSequenceAction } from "@/app/(dashboard)/campaigns/push-actions";
import { addCampaign, ensureData, getDataset, seedCampaignVariants } from "@/lib/data/store";
import { updateInstantlyCampaignSequence } from "@/lib/integrations/instantly";
import { syncCampaigns } from "@/lib/sync/campaigns";

async function freshLinkedCampaign(name: string) {
  await ensureData();
  const c = await addCampaign({ name, vertical: "Med Spas", personaId: "pe_trevor", dailyCap: 50 }, "Test Operator");
  getDataset().campaigns.find((x) => x.id === c.id)!.instantlyCampaignId = `inst_${c.id}`;
  await seedCampaignVariants(c.id, [
    { step: 1, subject: "quick question", body: "{{firstName}}, original step one." },
    { step: 2, subject: "re: quick question", body: "{{firstName}}, following up." },
  ], "Test Operator");
  return c;
}

describe("upgradeSequenceAction — live push + hub mirror", () => {
  beforeEach(() => {
    vi.mocked(syncCampaigns).mockClear();
    vi.mocked(updateInstantlyCampaignSequence).mockClear();
  });

  it("pushes opener + B subjects to Instantly, then mirrors the hub via syncCampaigns", async () => {
    const c = await freshLinkedCampaign("Upgrade Sync Test");
    const res = await upgradeSequenceAction(c.id);
    expect(res).toMatchObject({ ok: true, personalized: true, subjectsAdded: 2, steps: 2 });

    const pushed = vi.mocked(updateInstantlyCampaignSequence).mock.calls.at(-1)![1] as { subject: string; body: string }[][];
    expect(pushed[0][0].body.startsWith("{{personalization}}\n\n")).toBe(true);
    expect(pushed[0].map((v) => v.subject)).toEqual(["quick question", "alt: quick question"]);
    expect(pushed[1].map((v) => v.subject)).toEqual(["re: quick question", "alt: re: quick question"]);
    // The hub mirror runs AFTER the successful push.
    expect(syncCampaigns).toHaveBeenCalledTimes(1);
  });

  it("does NOT run the hub mirror when the Instantly push fails", async () => {
    const c = await freshLinkedCampaign("Upgrade Sync Fail");
    vi.mocked(updateInstantlyCampaignSequence).mockRejectedValueOnce(new Error("instantly down"));
    const res = await upgradeSequenceAction(c.id);
    expect(res.ok).toBe(false);
    expect(syncCampaigns).not.toHaveBeenCalled();
  });
});
