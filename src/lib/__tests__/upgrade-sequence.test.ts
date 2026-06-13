import { describe, it, expect, vi } from "vitest";

/**
 * Two bugs caught by the LIVE pre-launch sweep (running against real Instantly):
 *
 * 1. upgradeSequenceAction pushed the {{personalization}} opener + A/B subjects to
 *    Instantly but never wrote them back to the hub's variant rows — the launch
 *    checklist reported "no opener", the metrics sync couldn't match the new B arm,
 *    and a later "Push copy to Instantly" would CLOBBER the upgraded live sequence
 *    with the stale hub copy. The hub rows must mirror the live sequence.
 *
 * 2. activateCampaign / pauseCampaign POSTed with content-type: application/json and
 *    NO body — Instantly 400s that ("Body cannot be empty…"), which silently broke
 *    the Launch button AND the Pause kill switch (incl. deliverability auto-pause).
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
vi.mock("@/lib/ai/copy", () => ({
  rewriteCopy: vi.fn(async (input: { subject: string }) => ({ source: "ai" as const, subject: `alt: ${input.subject}`, body: "" })),
}));

import { upgradeSequenceAction } from "@/app/(dashboard)/campaigns/push-actions";
import { addCampaign, ensureData, getDataset, getVariants, seedCampaignVariants } from "@/lib/data/store";
import { updateInstantlyCampaignSequence } from "@/lib/integrations/instantly";

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

describe("upgradeSequenceAction — hub write-back mirrors the live sequence", () => {
  it("persists the opener and the new B subjects to the hub's variant rows", async () => {
    const c = await freshLinkedCampaign("Upgrade WB Test");
    const res = await upgradeSequenceAction(c.id);
    expect(res.ok).toBe(true);
    expect(res.personalized).toBe(true);
    expect(res.subjectsAdded).toBe(2);

    const vars = getVariants().filter((v) => v.campaignId === c.id);
    const s1 = vars.filter((v) => v.step === 1).sort((a, b) => a.variant.localeCompare(b.variant));
    expect(s1).toHaveLength(2); // A + the new B arm
    expect(s1[0].body.startsWith("{{personalization}}\n\n")).toBe(true);
    expect(s1[1].variant).toBe("B");
    expect(s1[1].subject).toBe("alt: quick question");
    // What went to Instantly is exactly what the hub now holds.
    const pushed = vi.mocked(updateInstantlyCampaignSequence).mock.calls.at(-1)![1] as { subject: string; body: string }[][];
    expect(pushed[0].map((v) => v.subject)).toEqual(s1.map((v) => v.subject));
    expect(pushed[0][0].body).toBe(s1[0].body);
  });

  it("is idempotent — a re-run changes nothing and adds no duplicate arms", async () => {
    const c = await freshLinkedCampaign("Upgrade WB Idem");
    await upgradeSequenceAction(c.id);
    const before = getVariants().filter((v) => v.campaignId === c.id).map((v) => ({ ...v }));
    const second = await upgradeSequenceAction(c.id);
    expect(second.ok).toBe(true);
    expect(second.personalized).toBe(false);
    expect(second.subjectsAdded).toBe(0);
    const after = getVariants().filter((v) => v.campaignId === c.id);
    expect(after).toHaveLength(before.length);
    expect(after.map((v) => v.body)).toEqual(before.map((v) => v.body));
  });

  it("does NOT touch hub rows when the Instantly push fails", async () => {
    const c = await freshLinkedCampaign("Upgrade WB Fail");
    vi.mocked(updateInstantlyCampaignSequence).mockRejectedValueOnce(new Error("instantly down"));
    const res = await upgradeSequenceAction(c.id);
    expect(res.ok).toBe(false);
    const s1 = getVariants().filter((v) => v.campaignId === c.id && v.step === 1);
    expect(s1).toHaveLength(1); // no B row
    expect(s1[0].body.includes("{{personalization}}")).toBe(false); // no opener
  });
});
