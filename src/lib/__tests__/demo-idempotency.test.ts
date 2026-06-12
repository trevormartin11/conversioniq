import { describe, it, expect, vi } from "vitest";

/** A double-click on "Book demo" must not hand ConversionIQ two deals for one prospect,
 *  and the CIQ deal must be pushed AFTER the demo persists (a failed insert + retry used
 *  to strand a duplicate deal in their pipeline). */

const pushDemoDeal = vi.fn(async (_lead: unknown, _demo: unknown) => ({ dealId: "deal_test_1" }));
vi.mock("@/lib/integrations/zoho-civ", () => ({
  pushDemoDeal: (lead: unknown, demo: unknown) => pushDemoDeal(lead, demo),
}));

import { addDemo, ensureData, getDemos, getLeads } from "@/lib/data/store";

describe("addDemo — one open demo per lead", () => {
  it("returns the existing open demo instead of creating a duplicate (one CIQ deal)", async () => {
    await ensureData();
    const lead = getLeads().find((l) => !getDemos().some((d) => d.leadId === l.id));
    expect(lead).toBeTruthy();

    const first = await addDemo({ leadId: lead!.id, scheduledAt: new Date().toISOString(), owner: "Jon" }, "Test");
    const second = await addDemo({ leadId: lead!.id, scheduledAt: new Date().toISOString(), owner: "Jon" }, "Test");

    expect(second.id).toBe(first.id);
    expect(getDemos().filter((d) => d.leadId === lead!.id)).toHaveLength(1);
    expect(pushDemoDeal).toHaveBeenCalledTimes(1);
    expect(first.civDealId).toBe("deal_test_1");
  });
});
