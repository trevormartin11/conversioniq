import { describe, it, expect, vi } from "vitest";

/** The Lab loops this action until done — EVERY lead with a website gets covered, in small
 *  batches that fit the serverless budget, and a hung lead can't stall the batch forever. */

const personalizeFromUrl = vi.fn(async (url: string, _ctx: unknown) => ({ line: `saw ${url}`, basis: "website", source: "ai" as const }));
vi.mock("@/lib/ai/personalize", () => ({
  personalizeFromUrl: (url: string, ctx: unknown) => personalizeFromUrl(url, ctx),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { personalizeCampaignBatchAction } from "@/app/(dashboard)/campaigns/personalize-actions";
import { addCampaign, addLeads, ensureData } from "@/lib/data/store";

describe("personalizeCampaignBatchAction — full-campaign coverage in batches", () => {
  it("pages through ALL of the campaign's leads (not a fixed sample) and reports done", async () => {
    await ensureData();
    const c = await addCampaign({ name: "Pers Test", vertical: "Med Spas", personaId: "pe_trevor", dailyCap: 80 }, "Test");
    await addLeads(
      Array.from({ length: 7 }, (_, i) => ({
        email: `p${i}@pers-spa-${i}.com`, firstName: "P", lastName: `${i}`, company: `Spa ${i}`, title: "Owner",
        phone: null, domain: `pers-spa-${i}.com`, vertical: "Med Spas", persona: "Trevor Martin",
        sendingDomain: "ciqsends.com", campaignId: c.id, listVersion: "v1", source: "import" as const,
        attributionOwner: "Test", status: "new" as const, zohoLeadId: null, apolloId: null, lastContactedAt: null,
      })),
      "Test",
    );

    const first = await personalizeCampaignBatchAction(c.id, 0);
    expect(first.total).toBe(7);
    expect(first.items).toHaveLength(5); // batch size — fits the serverless budget
    expect(first.done).toBe(false);

    const second = await personalizeCampaignBatchAction(c.id, first.items.length);
    expect(second.items).toHaveLength(2);
    expect(second.done).toBe(true);
    expect(personalizeFromUrl).toHaveBeenCalledTimes(7); // every lead, exactly once
  });

  it("returns done for an unknown campaign instead of looping forever", async () => {
    const r = await personalizeCampaignBatchAction("c_nope", 0);
    expect(r).toEqual({ items: [], total: 0, done: true });
  });
});
