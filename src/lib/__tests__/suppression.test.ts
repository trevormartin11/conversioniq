import { describe, it, expect } from "vitest";
import { dedupeAgainstUniverse, isSuppressed } from "@/lib/data/store";

describe("global suppression (enforced at load time)", () => {
  it("flags a known DNC email", () => {
    const res = isSuppressed("owner@elitelaserspa.com");
    expect(res.suppressed).toBe(true);
    expect(res.entry?.reason).toBe("dnc");
  });

  it("flags any address on a suppressed domain", () => {
    const res = isSuppressed("anyone@competitorspa.com");
    expect(res.suppressed).toBe(true);
    expect(res.entry?.reason).toBe("manual");
  });

  it("passes a genuinely new address", () => {
    expect(isSuppressed("brand_new@zzz-unseen-domain-xyz.com").suppressed).toBe(false);
  });

  it("dedupes a new list against the entire universe + within the list", () => {
    const { clean, rejected } = dedupeAgainstUniverse([
      { email: "owner@elitelaserspa.com" }, // DNC
      { email: "ceo@competitorspa.com" }, // suppressed domain
      { email: "fresh@zzz-unseen-domain-xyz.com" }, // clean
      { email: "fresh@zzz-unseen-domain-xyz.com" }, // duplicate within list
    ]);
    expect(clean).toHaveLength(1);
    expect(clean[0].email).toBe("fresh@zzz-unseen-domain-xyz.com");
    expect(rejected).toHaveLength(3);
    const reasons = rejected.map((r) => r.reason);
    expect(reasons).toContain("dnc");
    expect(reasons).toContain("manual");
    expect(reasons).toContain("duplicate in list");
  });
});
