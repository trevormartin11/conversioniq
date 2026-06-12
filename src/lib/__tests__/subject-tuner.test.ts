import { describe, it, expect } from "vitest";
import { pickWinner, netStats, MIN_SENDS_PER_ARM } from "@/lib/ai/subject-tuner";
import { mapStepAnalytics, variantIndex } from "@/lib/sync/variant-metrics";
import { provenContextBlock } from "@/lib/ai/proven";
import { ensureData } from "@/lib/data/store";

describe("pickWinner — a verdict requires sample AND significance", () => {
  it("refuses a verdict below the minimum sample, however lopsided", () => {
    expect(pickWinner({ sends: 50, opens: 40 }, { sends: 50, opens: 5 })).toBeNull();
    expect(pickWinner({ sends: MIN_SENDS_PER_ARM, opens: 80 }, { sends: 99, opens: 5 })).toBeNull();
  });

  it("declares a clear winner with adequate sample", () => {
    const v = pickWinner({ sends: 200, opens: 90 }, { sends: 200, opens: 50 });
    expect(v?.winner).toBe(0);
    expect(v!.z).toBeGreaterThan(1.64);
    expect(v!.winnerRate).toBeCloseTo(0.45);
  });

  it("keeps testing on a statistical tie (noise must not trigger promotions)", () => {
    expect(pickWinner({ sends: 200, opens: 60 }, { sends: 200, opens: 56 })).toBeNull();
    expect(pickWinner({ sends: 1000, opens: 0 }, { sends: 1000, opens: 0 })).toBeNull();
  });

  it("orders the verdict correctly when B wins", () => {
    const v = pickWinner({ sends: 200, opens: 50 }, { sends: 200, opens: 90 });
    expect(v?.winner).toBe(1);
  });
});

describe("netStats — cumulative counters minus the last promotion's baseline", () => {
  it("subtracts the snapshot so a fresh challenger isn't judged on the old subject's history", () => {
    expect(netStats({ sent: 350, opens: 120 }, { sent: 300, opens: 110 })).toEqual({ sends: 50, opens: 10 });
    expect(netStats({ sent: 350, opens: 120 })).toEqual({ sends: 350, opens: 120 });
    expect(netStats({ sent: 100, opens: 10 }, { sent: 150, opens: 20 })).toEqual({ sends: 0, opens: 0 }); // clamped
  });
});

describe("mapStepAnalytics — Instantly rows → hub variant ids", () => {
  it("maps 1-based steps and letter/index variants, tolerating field drift", () => {
    const rows = mapStepAnalytics("inst1", [
      { step: 1, variant: "A", sent: 120, opened: 40, replies: 6 },
      { step: 1, variant: 1, emails_sent_count: 118, open_count: 22, reply_count: 3 },
      { step: 2, variant: "B", sent: 90, opened: 30, replies: 2 },
      { variant: "A", sent: 10 }, // no step → unmappable, skipped
    ]);
    expect(rows).toEqual([
      { id: "sv_inst1_0_0", sent: 120, opens: 40, replies: 6 },
      { id: "sv_inst1_0_1", sent: 118, opens: 22, replies: 3 },
      { id: "sv_inst1_1_1", sent: 90, opens: 30, replies: 2 },
    ]);
  });

  it("parses variant identifiers in every observed shape", () => {
    expect(variantIndex("A")).toBe(0);
    expect(variantIndex("b")).toBe(1);
    expect(variantIndex(1)).toBe(1);
    expect(variantIndex("2")).toBe(2);
    expect(variantIndex("AB")).toBeNull();
    expect(variantIndex(null)).toBeNull();
  });
});

describe("provenContextBlock — evidence only, never noise", () => {
  it("builds a compact evidence block from the seed (which has sends + demo outcomes)", async () => {
    await ensureData();
    const block = provenContextBlock();
    // The seed carries variant counters and lost demos, so all three signal types appear.
    expect(block).toContain("PROVEN signals");
    expect(block).toMatch(/Subject lines PROVEN|Verticals converting|Demos are being LOST/);
  });
});
