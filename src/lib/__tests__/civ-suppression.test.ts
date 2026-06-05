import { describe, it, expect } from "vitest";
import { domainFromWebsite, syncCivCustomers } from "@/lib/jobs/civ-suppression";

describe("domainFromWebsite", () => {
  it("normalizes various website formats to a bare host", () => {
    expect(domainFromWebsite("https://www.glowspa.com/about")).toBe("glowspa.com");
    expect(domainFromWebsite("glowspa.com")).toBe("glowspa.com");
    expect(domainFromWebsite("http://GlowSpa.com")).toBe("glowspa.com");
  });
  it("returns null for junk", () => {
    expect(domainFromWebsite("")).toBeNull();
    expect(domainFromWebsite(null)).toBeNull();
    expect(domainFromWebsite("localhost")).toBeNull();
  });
});

describe("syncCivCustomers", () => {
  it("is a safe no-op when CIQ's Zoho isn't configured", async () => {
    const r = await syncCivCustomers();
    expect(r).toEqual({ scanned: 0, suppressed: 0 });
  });
});
