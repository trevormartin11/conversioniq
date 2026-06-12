import { describe, it, expect } from "vitest";
import { isLandingHost, normalizeHost, publishHostFor, recordNameFor } from "@/lib/landing/publish";
import { mergeCnameHost } from "@/lib/integrations/namecheap";
import { addCampaign, ensureData, generateLandingPage, approveLandingPage, publishLandingPage, getLandingByHost, getLandingPage } from "@/lib/data/store";

describe("publishHostFor — pages live on a SUBDOMAIN of the sending domain", () => {
  it("prefixes the landing subdomain on a bare domain", () => {
    expect(publishHostFor("ciqsends.com")).toBe("go.ciqsends.com");
  });
  it("uses an explicit subdomain verbatim, and strips scheme/path/case", () => {
    expect(publishHostFor("book.ciqsends.com")).toBe("book.ciqsends.com");
    expect(publishHostFor("https://CIQSends.com/x")).toBe("go.ciqsends.com");
  });
  it("computes the DNS record name within the zone", () => {
    expect(recordNameFor("go.ciqsends.com", "ciqsends.com")).toBe("go");
    expect(recordNameFor("ciqsends.com", "ciqsends.com")).toBe("@");
  });
});

describe("isLandingHost — the public router fails toward the app (auth)", () => {
  const app = "hub.conversioniq.com";
  it("routes a foreign host to the landing renderer", () => {
    expect(isLandingHost("go.ciqsends.com", app)).toBe(true);
  });
  it("never routes the app host, Vercel previews, localhost, or unknown app host", () => {
    expect(isLandingHost("hub.conversioniq.com", app)).toBe(false);
    expect(isLandingHost("HUB.conversioniq.com:443", app)).toBe(false);
    expect(isLandingHost("my-branch-preview.vercel.app", app)).toBe(false);
    expect(isLandingHost("localhost:3000", app)).toBe(false);
    expect(isLandingHost("go.ciqsends.com", "")).toBe(false); // app host unknown → stay closed
  });
  it("normalizes ports and case", () => {
    expect(normalizeHost("GO.CIQSends.com:443")).toBe("go.ciqsends.com");
  });
});

describe("mergeCnameHost — read-merge-write never collides with existing records", () => {
  it("adds the CNAME when the host is unclaimed", () => {
    const { hosts, added } = mergeCnameHost([{ name: "_dmarc", type: "TXT", address: "v=DMARC1", mxPref: "10", ttl: "1800" }], "go", "cname.vercel-dns.com");
    expect(added).toBe(true);
    expect(hosts).toHaveLength(2);
  });
  it("refuses to overwrite an existing record on the same host", () => {
    const existing = [{ name: "go", type: "A", address: "1.2.3.4", mxPref: "10", ttl: "1800" }];
    const { hosts, added } = mergeCnameHost(existing, "go", "cname.vercel-dns.com");
    expect(added).toBe(false);
    expect(hosts).toEqual(existing);
  });
});

describe("publish lifecycle — only PUBLISHED pages resolve publicly", () => {
  it("generate → approve → publish → resolvable by host; drafts never resolve", async () => {
    await ensureData();
    const c = await addCampaign({ name: "LP Test", vertical: "Med Spas", personaId: "pe_trevor", dailyCap: 80 }, "Test");
    await generateLandingPage(c.id, "Test");
    expect(getLandingByHost("go.lptest-spa.com")).toBeNull(); // draft — must not serve

    await approveLandingPage(c.id, "Test");
    expect(getLandingByHost("go.lptest-spa.com")).toBeNull(); // approved ≠ published

    await publishLandingPage(c.id, "https://go.lptest-spa.com", "Test");
    const page = getLandingByHost("go.lptest-spa.com");
    expect(page?.campaignId).toBe(c.id);
    expect(page?.status).toBe("published");
    expect(getLandingPage(c.id)?.publishedUrl).toBe("https://go.lptest-spa.com");
    expect(getLandingByHost("go.some-other.com")).toBeNull();
  });
});
