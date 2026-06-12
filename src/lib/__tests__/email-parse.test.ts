import { describe, it, expect } from "vitest";
import { extractEmail, isLikelyEmail } from "@/lib/email";

describe("extractEmail — canonical address extraction for the suppression gate", () => {
  it("extracts the address from the universal 'Name <addr>' clipboard format", () => {
    // Before the fix, dedupeListAction kept '<owner@dnc.com>' verbatim (it has an @) so it
    // never matched the normalized suppression key — a DNC bypass.
    expect(extractEmail("Owner Person <owner@elitelaserspa.com>")).toBe("owner@elitelaserspa.com");
  });

  it("strips wrapping quotes and trailing sentence punctuation, and lowercases", () => {
    expect(extractEmail('"Owner@EliteLaserSpa.com"')).toBe("owner@elitelaserspa.com");
    expect(extractEmail("owner@elitelaserspa.com.")).toBe("owner@elitelaserspa.com");
    expect(extractEmail("  owner@elitelaserspa.com ,")).toBe("owner@elitelaserspa.com");
  });

  it("returns the bare address unchanged", () => {
    expect(extractEmail("a@b.com")).toBe("a@b.com");
  });

  it("rejects non-addresses", () => {
    expect(extractEmail("no-at-sign")).toBeNull();
    expect(extractEmail("")).toBeNull();
    expect(extractEmail("   ")).toBeNull();
    expect(extractEmail("a@b")).toBeNull(); // no dot in domain
    expect(extractEmail("a@@b.com")).toBeNull();
    expect(extractEmail("a b@c.com")).toBeNull(); // internal whitespace
  });
});

describe("dedupeAgainstUniverse — Set-based suppression lookup", () => {
  it("still rejects by suppressed DOMAIN through the map path", async () => {
    const { ensureData, dedupeAgainstUniverse } = await import("@/lib/data/store");
    await ensureData();
    // competitorspa.com is domain-suppressed in the seed.
    const { clean, rejected } = dedupeAgainstUniverse([
      { email: "ceo@competitorspa.com" },
      { email: "fresh@brand-new-spa.com" },
    ]);
    expect(clean.map((c) => c.email)).toEqual(["fresh@brand-new-spa.com"]);
    expect(rejected).toHaveLength(1);
  });
});

describe("isLikelyEmail", () => {
  it("accepts plausible addresses, rejects malformed ones", () => {
    expect(isLikelyEmail("x@y.com")).toBe(true);
    expect(isLikelyEmail("x@y")).toBe(false);
    expect(isLikelyEmail("@y.com")).toBe(false);
    expect(isLikelyEmail("x@.com")).toBe(false);
    expect(isLikelyEmail("x@y.com.")).toBe(false);
    expect(isLikelyEmail("   ")).toBe(false);
  });
});
