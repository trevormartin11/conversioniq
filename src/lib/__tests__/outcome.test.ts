import { describe, it, expect } from "vitest";
import { mapLostReason } from "@/lib/outcome";

describe("mapLostReason — free text from CIQ -> structured taxonomy", () => {
  it("maps common phrasings", () => {
    expect(mapLostReason("Too expensive right now").reason).toBe("no_budget");
    expect(mapLostReason("Going with a competitor").reason).toBe("competitor");
    expect(mapLostReason("Revisit next quarter").reason).toBe("bad_timing");
    expect(mapLostReason("Too small, not our ICP").reason).toBe("not_icp");
    expect(mapLostReason("Prospect was a no-show").reason).toBe("no_show");
    expect(mapLostReason("Went dark, no response").reason).toBe("no_decision");
    expect(mapLostReason("Just not interested").reason).toBe("not_interested");
  });

  it("falls back to other and preserves the raw note", () => {
    const m = mapLostReason("something idiosyncratic");
    expect(m.reason).toBe("other");
    expect(m.note).toBe("something idiosyncratic");
  });

  it("handles empty/nullish input", () => {
    expect(mapLostReason("").reason).toBe("other");
    expect(mapLostReason(null).note).toBeNull();
  });
});
