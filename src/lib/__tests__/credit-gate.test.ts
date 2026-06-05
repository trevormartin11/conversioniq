import { describe, it, expect } from "vitest";
import { createCreditRequest, decideCreditRequest, executeCreditSpend } from "@/lib/data/store";

describe("CIQ credit gate (hard rule)", () => {
  it("blocks self-approval, then allows partner approval", async () => {
    const req = await createCreditRequest({ provider: "apollo_ciq", amount: 100, reason: "t", requestedBy: "Jon Epstein" });
    // requester cannot approve their own request
    expect(await decideCreditRequest(req.id, "approved", "Jon Epstein")).toBeNull();
    // a different partner can
    expect((await decideCreditRequest(req.id, "approved", "Trevor Martin"))?.status).toBe("approved");
  });

  it("prevents double-spend (no re-approve / re-execute of a terminal request)", async () => {
    const req = await createCreditRequest({ provider: "apollo_ciq", amount: 250, reason: "t", requestedBy: "Brian Peters" });
    await decideCreditRequest(req.id, "approved", "Trevor Martin");
    expect((await executeCreditSpend(req.id, "Trevor Martin"))?.status).toBe("executed");
    // already executed -> cannot be re-approved or re-executed
    expect(await decideCreditRequest(req.id, "approved", "Jon Epstein")).toBeNull();
    expect(await executeCreditSpend(req.id, "Jon Epstein")).toBeNull();
  });
});
