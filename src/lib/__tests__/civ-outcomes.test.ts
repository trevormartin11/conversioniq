import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Demo, DemoStatus } from "@/lib/data/types";

vi.mock("@/lib/integrations/zoho-civ", () => ({ getCivDealOutcome: vi.fn() }));
vi.mock("@/lib/data/store", () => ({ getDemos: vi.fn(), recordDemoOutcome: vi.fn() }));

import { reconcileCivOutcomes } from "@/lib/jobs/civ-outcomes";
import { getCivDealOutcome } from "@/lib/integrations/zoho-civ";
import { getDemos, recordDemoOutcome } from "@/lib/data/store";

function demo(id: string, civDealId: string | null, status: DemoStatus = "booked"): Demo {
  return {
    id,
    leadId: `lead_${id}`,
    scheduledAt: "2026-06-01T00:00:00Z",
    status,
    owner: "Jon",
    mrr: null,
    outcomeReason: null,
    outcomeNote: null,
    outcomeAt: null,
    civDealId,
    reminderSentAt: null,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("reconcileCivOutcomes", () => {
  it("records won/lost from polled stages; skips in-flight; ignores demos without a deal or already terminal", async () => {
    vi.mocked(getDemos).mockReturnValue([
      demo("1", "d1"), // -> won
      demo("2", "d2"), // -> lost
      demo("3", "d3"), // -> still in flight
      demo("4", null), // no handoff deal -> filtered out
      demo("5", "d5", "closed"), // already terminal -> filtered out
      demo("6", "d6", "lost"), // already terminal -> filtered out
    ]);
    vi.mocked(getCivDealOutcome).mockImplementation(async (dealId: string) => {
      if (dealId === "d1") return { stage: "Closed Won", amount: 900, lostReason: null };
      if (dealId === "d2") return { stage: "Closed Lost", amount: null, lostReason: null };
      if (dealId === "d3") return { stage: "Demo Completed", amount: null, lostReason: null };
      return null;
    });

    const res = await reconcileCivOutcomes();

    expect(res).toEqual({ checked: 3, won: 1, lost: 1, pending: 1 });
    expect(recordDemoOutcome).toHaveBeenCalledTimes(2);
    expect(recordDemoOutcome).toHaveBeenCalledWith("1", { result: "won", mrr: 900 }, "ConversionIQ (reconcile)");
    expect(recordDemoOutcome).toHaveBeenCalledWith("2", { result: "lost", reason: "other" }, "ConversionIQ (reconcile)");
  });

  it("treats an unreadable deal as pending (no outcome recorded)", async () => {
    vi.mocked(getDemos).mockReturnValue([demo("1", "d1")]);
    vi.mocked(getCivDealOutcome).mockResolvedValue(null);
    const res = await reconcileCivOutcomes();
    expect(res).toEqual({ checked: 1, won: 0, lost: 0, pending: 1 });
    expect(recordDemoOutcome).not.toHaveBeenCalled();
  });
});
