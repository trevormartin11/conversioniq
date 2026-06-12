import { describe, it, expect } from "vitest";
import { pct, rate } from "@/lib/format";

describe("format guards — never surface NaN/Infinity in the UI", () => {
  it("pct renders a dash for non-finite input instead of 'NaN%'", () => {
    expect(pct(NaN)).toBe("—");
    expect(pct(Infinity)).toBe("—");
    expect(pct(0.25, 1)).toBe("25.0%");
  });

  it("rate returns 0 for a non-finite numerator or zero denominator", () => {
    expect(rate(NaN, 10)).toBe(0);
    expect(rate(5, 0)).toBe(0);
    expect(rate(Infinity, 10)).toBe(0);
    expect(rate(3, 12)).toBe(0.25);
  });
});
