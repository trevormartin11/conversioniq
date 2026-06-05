import { describe, it, expect } from "vitest";
import { addLeads, ensureData, getLeads } from "@/lib/data/store";

describe("addLeads — persist sourced leads with attribution at source", () => {
  it("stamps id + createdAt, preserves attribution, and lands in the universe", async () => {
    await ensureData();
    const before = getLeads().length;
    const created = await addLeads(
      [
        {
          email: "owner@brandnewmedspa-xyz.com",
          domain: "brandnewmedspa-xyz.com",
          firstName: "Dana",
          lastName: "Lee",
          company: "Brand New Med Spa",
          title: "Owner",
          phone: "+1 555 0100",
          campaignId: "c_medspa",
          vertical: "Med Spas",
          persona: "Avery",
          sendingDomain: "outreach-x.com",
          listVersion: "med_spas_v1",
          source: "outscraper",
          attributionOwner: "Trevor",
          status: "new",
          zohoLeadId: "zoho_123",
          apolloId: null,
          lastContactedAt: null,
        },
      ],
      "Trevor",
    );
    expect(created).toHaveLength(1);
    expect(created[0].id).toMatch(/^l_/);
    expect(created[0].createdAt).toBeTruthy();
    expect(created[0].vertical).toBe("Med Spas");
    expect(created[0].zohoLeadId).toBe("zoho_123");
    expect(getLeads().length).toBe(before + 1);
    expect(getLeads().some((l) => l.email === "owner@brandnewmedspa-xyz.com")).toBe(true);
  });

  it("no-ops cleanly on empty input", async () => {
    await ensureData();
    const before = getLeads().length;
    expect(await addLeads([])).toEqual([]);
    expect(getLeads().length).toBe(before);
  });
});
