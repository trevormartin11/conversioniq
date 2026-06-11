import { describe, it, expect, vi } from "vitest";

/**
 * Exercises the full push-to-Instantly path (the launch headline flow): hub draft →
 * create in Instantly → sync pulls the canonical row → leads carried over → staging
 * draft retired. External boundaries (Instantly API, the sync, auth, Next cache) are
 * mocked; everything in between runs for real against the in-memory store.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({ id: "u_test", name: "Test Operator", email: "test@ciq.local", role: "owner" as const, avatarColor: "#888" }),
}));
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, integrations: { ...actual.integrations, instantly: true } };
});
vi.mock("@/lib/integrations/instantly", () => ({
  createInstantlyCampaign: vi.fn(async () => ({ id: "inst_test_1" })),
  addLeadsToCampaign: vi.fn(async (_id: string, leads: unknown[]) => ({ added: leads.length, failed: 0 })),
  activateCampaign: vi.fn(async () => ({})),
  pauseCampaign: vi.fn(async () => ({})),
  deleteInstantlyCampaign: vi.fn(async () => ({})),
}));
vi.mock("@/lib/sync/campaigns", () => ({
  // The real sync pulls the new campaign back from Instantly as the canonical c_<instId>
  // row — simulate exactly that effect on the store.
  syncCampaigns: vi.fn(async () => {
    const { getDataset } = await import("@/lib/data/store");
    getDataset().campaigns.unshift({
      id: "c_inst_test_1", name: "Push Test", vertical: "Med Spas", personaId: "pe_trevor",
      status: "draft", instantlyCampaignId: "inst_test_1", listVersion: "med_spas_v1",
      inboxIds: [], dailyCap: 80, createdAt: new Date().toISOString(),
    });
    return { campaigns: 1 };
  }),
}));

import { pushCampaignToInstantlyAction } from "@/app/(dashboard)/campaigns/actions";
import { addCampaign, addLeads, ensureData, getCampaign, getInboxes, getLeads, seedCampaignVariants } from "@/lib/data/store";
import { createInstantlyCampaign, addLeadsToCampaign } from "@/lib/integrations/instantly";

async function makeDraft(withSteps = true) {
  const draft = await addCampaign({ name: "Push Test", vertical: "Med Spas", personaId: "pe_trevor", dailyCap: 80 }, "Test Operator");
  if (withSteps) await seedCampaignVariants(draft.id, [{ step: 1, subject: "quick question", body: "hey {{firstName}}" }], "Test Operator");
  return draft;
}

describe("pushCampaignToInstantlyAction — hub draft becomes a sendable Instantly campaign", () => {
  it("creates in Instantly, carries the draft's leads, and retires the staging draft", async () => {
    await ensureData();
    const draft = await makeDraft();
    const [lead] = await addLeads([{
      email: "push-test-lead@example-newspa.com", domain: "example-newspa.com",
      firstName: "Pat", lastName: "Lee", company: "Example New Spa", title: "Owner", phone: null,
      campaignId: draft.id, vertical: "Med Spas", persona: "Trevor Martin", sendingDomain: "",
      listVersion: draft.listVersion, source: "import", attributionOwner: "Test Operator",
      status: "new", zohoLeadId: null, apolloId: null, lastContactedAt: null,
    }], "Test Operator");
    const inbox = getInboxes()[0];

    const res = await pushCampaignToInstantlyAction(draft.id, [inbox.id]);

    expect(res.ok).toBe(true);
    expect(res.ok && res.id).toBe("c_inst_test_1");
    // Instantly got the draft's sequence + chosen inbox.
    expect(createInstantlyCampaign).toHaveBeenCalledWith(expect.objectContaining({
      name: "Push Test",
      steps: [{ subject: "quick question", body: "hey {{firstName}}" }],
      inboxEmails: [inbox.email],
      dailyLimit: 80,
    }));
    // The draft's leads were loaded into the new Instantly campaign and re-attributed in the hub.
    expect(addLeadsToCampaign).toHaveBeenCalledWith("inst_test_1", [expect.objectContaining({ email: "push-test-lead@example-newspa.com" })]);
    expect(getLeads().find((l) => l.id === lead.id)?.campaignId).toBe("c_inst_test_1");
    // Staging draft retired; the canonical row is the one to keep.
    expect(getCampaign(draft.id)).toBeNull();
    expect(getCampaign("c_inst_test_1")?.instantlyCampaignId).toBe("inst_test_1");
  });

  it("refuses without sequence copy", async () => {
    await ensureData();
    const draft = await makeDraft(false);
    const res = await pushCampaignToInstantlyAction(draft.id, [getInboxes()[0].id]);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/sequence copy/i);
  });

  it("refuses without a sending inbox", async () => {
    await ensureData();
    const draft = await makeDraft();
    const res = await pushCampaignToInstantlyAction(draft.id, []);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/inbox/i);
  });

  it("refuses a campaign that is already on Instantly", async () => {
    await ensureData();
    const linked = getCampaign("c_inst_test_1");
    expect(linked).toBeTruthy();
    const res = await pushCampaignToInstantlyAction(linked!.id, [getInboxes()[0].id]);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/already/i);
  });
});
