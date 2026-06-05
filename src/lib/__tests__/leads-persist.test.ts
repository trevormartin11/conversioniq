import { describe, it, expect } from "vitest";
import { addDemo, addLeads, ensureData, getLead, getLeads, updateDemo } from "@/lib/data/store";
import { attribution } from "@/lib/data/queries";
import type { NewLead } from "@/lib/data/store";

const baseLead = (over: Partial<NewLead>): NewLead => ({
  email: "x@x.com", domain: "x.com", firstName: "A", lastName: "B", company: "Co", title: "Owner",
  phone: null, campaignId: "c_medspa", vertical: "Med Spas", persona: "Avery", sendingDomain: "d.com",
  listVersion: "v1", source: "outscraper", attributionOwner: "Trevor", status: "new", zohoLeadId: null,
  apolloId: null, lastContactedAt: null, ...over,
});

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

describe("demo lifecycle — book -> close -> MRR drives the lead + residual", () => {
  it("books (lead -> demo_booked) then closes with MRR (lead -> closed)", async () => {
    await ensureData();
    const [lead] = await addLeads(
      [
        {
          email: "owner@closetest-xyz.com", domain: "closetest-xyz.com", firstName: "Sam", lastName: "Rivera",
          company: "Close Test Spa", title: "Owner", phone: null, campaignId: "c_medspa", vertical: "Med Spas",
          persona: "Avery", sendingDomain: "outreach-x.com", listVersion: "med_spas_v1", source: "outscraper",
          attributionOwner: "Trevor", status: "positive", zohoLeadId: null, apolloId: null, lastContactedAt: null,
        },
      ],
      "Trevor",
    );

    const demo = await addDemo({ leadId: lead.id, scheduledAt: new Date().toISOString(), owner: "Trevor" }, "Trevor");
    expect(demo.status).toBe("booked");
    expect(getLead(lead.id)?.status).toBe("demo_booked");

    const closed = await updateDemo(demo.id, { status: "closed", mrr: 1500 }, "Trevor");
    expect(closed?.status).toBe("closed");
    expect(closed?.mrr).toBe(1500);
    expect(getLead(lead.id)?.status).toBe("closed");
  });
});

describe("attribution — per-cell conversion from at-source tags", () => {
  it("groups by a dimension and rolls up MRR from closed demos", async () => {
    await ensureData();
    const vertical = `ZZZ Attr ${Math.random().toString(36).slice(2, 6)}`;
    const [l1] = await addLeads(
      [
        baseLead({ email: "a@attr-test.com", domain: "attr-test.com", vertical, status: "positive" }),
        baseLead({ email: "b@attr-test.com", domain: "attr-test.com", vertical, status: "new" }),
      ],
      "Trevor",
    );
    const demo = await addDemo({ leadId: l1.id, scheduledAt: new Date().toISOString(), owner: "Trevor" }, "Trevor");
    await updateDemo(demo.id, { status: "closed", mrr: 2000 }, "Trevor");

    const row = attribution("vertical").find((r) => r.key === vertical);
    expect(row).toBeTruthy();
    expect(row!.leads).toBe(2);
    expect(row!.closed).toBe(1);
    expect(row!.mrr).toBe(2000);
  });
});
