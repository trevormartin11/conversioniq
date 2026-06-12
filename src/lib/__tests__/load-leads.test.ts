import { describe, it, expect, vi } from "vitest";

/**
 * Exercises loadLeadsIntoCampaignAction — the spine that turns sourced/pasted leads into
 * campaign members: load-time suppression gate → persist with attribution-at-source →
 * (when the campaign is live on Instantly) load into sending. External boundaries
 * (Instantly, auth, Next cache) are mocked; the store runs for real.
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
  addLeadsToCampaign: vi.fn(async (_id: string, leads: unknown[]) => ({ added: leads.length, failed: 0 })),
}));

import { loadLeadsIntoCampaignAction } from "@/app/(dashboard)/leads/actions";
import { addCampaign, ensureData, getDataset, getLeads } from "@/lib/data/store";
import { addLeadsToCampaign } from "@/lib/integrations/instantly";
import type { SourcedLead } from "@/lib/sourcing/types";

const sourced = (email: string, company = "Example Spa Co"): SourcedLead => ({
  email, company, firstName: "Sam", lastName: "Reed", title: "Owner", source: "import",
});

describe("loadLeadsIntoCampaignAction — suppression gate, attribution, Instantly load", () => {
  it("filters suppressed leads and persists the clean ones with attribution from the campaign", async () => {
    await ensureData();
    const campaign = await addCampaign({ name: "Load Test", vertical: "Med Spas", personaId: "pe_trevor", dailyCap: 80 }, "Test Operator");

    const res = await loadLeadsIntoCampaignAction({
      campaignId: campaign.id,
      // owner@elitelaserspa.com is on the seeded DNC list — it must never get in.
      leads: [sourced("load-test-clean@example-freshspa.com"), sourced("owner@elitelaserspa.com")],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.persisted).toBe(1);
    // Not linked to Instantly yet → nothing loaded into sending, and the operator is told why.
    expect(res.instantlyAdded).toBe(0);
    expect(res.note).toMatch(/push this campaign to instantly/i);

    const lead = getLeads().find((l) => l.email === "load-test-clean@example-freshspa.com");
    expect(lead).toBeTruthy();
    expect(lead).toMatchObject({
      campaignId: campaign.id,
      vertical: "Med Spas",
      persona: "Trevor Martin", // resolved from the campaign's persona
      attributionOwner: "Test Operator",
      source: "import",
      status: "new",
    });
    expect(getLeads().some((l) => l.email === "owner@elitelaserspa.com")).toBe(false);
  });

  it("loads into Instantly when the campaign is linked", async () => {
    await ensureData();
    const campaign = await addCampaign({ name: "Load Test Linked", vertical: "Med Spas", personaId: "pe_trevor", dailyCap: 80 }, "Test Operator");
    getDataset().campaigns.find((c) => c.id === campaign.id)!.instantlyCampaignId = "inst_load_1";

    const res = await loadLeadsIntoCampaignAction({
      campaignId: campaign.id,
      leads: [sourced("load-test-linked@example-freshspa.com")],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.instantlyAdded).toBe(1);
    expect(addLeadsToCampaign).toHaveBeenCalledWith("inst_load_1", [
      expect.objectContaining({ email: "load-test-linked@example-freshspa.com" }),
    ]);
  });

  it("refuses when every lead is suppressed or a duplicate", async () => {
    await ensureData();
    const campaign = await addCampaign({ name: "Load Test Empty", vertical: "Med Spas", personaId: "pe_trevor", dailyCap: 80 }, "Test Operator");
    const res = await loadLeadsIntoCampaignAction({
      campaignId: campaign.id,
      leads: [sourced("owner@elitelaserspa.com")],
    });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/suppressed.*duplicate/i);
  });

  it("does not admit a DNC address wrapped in the 'Name <addr>' format", async () => {
    await ensureData();
    const campaign = await addCampaign({ name: "Load Test Angle", vertical: "Med Spas", personaId: "pe_trevor", dailyCap: 80 }, "Test Operator");
    const res = await loadLeadsIntoCampaignAction({
      campaignId: campaign.id,
      leads: [{ ...sourced("ignored"), email: "Owner Person <owner@elitelaserspa.com>" }],
    });
    expect(res.ok).toBe(false); // the only lead normalizes to a seeded DNC address → nothing clean
    expect(getLeads().some((l) => l.email.includes("owner@elitelaserspa.com"))).toBe(false);
  });

  it("keeps the first occurrence's data on an in-batch duplicate", async () => {
    await ensureData();
    const campaign = await addCampaign({ name: "Load Test Dupe", vertical: "Med Spas", personaId: "pe_trevor", dailyCap: 80 }, "Test Operator");
    const res = await loadLeadsIntoCampaignAction({
      campaignId: campaign.id,
      leads: [
        { ...sourced("dupe@example-freshspa.com"), firstName: "First" },
        { ...sourced("DUPE@example-freshspa.com"), firstName: "Second" },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.persisted).toBe(1);
    expect(getLeads().find((l) => l.email === "dupe@example-freshspa.com")?.firstName).toBe("First");
  });

  it("refuses an unknown campaign", async () => {
    await ensureData();
    const res = await loadLeadsIntoCampaignAction({ campaignId: "c_nope", leads: [sourced("x@example-freshspa.com")] });
    expect(res.ok).toBe(false);
  });
});
