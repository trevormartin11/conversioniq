import { describe, it, expect } from "vitest";
import { splitDomain, buildDmarcRecord, parseHosts, mergeDmarcHost, apiError } from "@/lib/integrations/namecheap";

describe("splitDomain", () => {
  it("splits apex domains into Namecheap SLD/TLD", () => {
    expect(splitDomain("reply-glowspa.com")).toEqual({ sld: "reply-glowspa", tld: "com" });
    expect(splitDomain("getglow.co.uk")).toEqual({ sld: "getglow", tld: "co.uk" });
    expect(splitDomain("www.Glow.com")).toEqual({ sld: "glow", tld: "com" });
    expect(splitDomain("nodot")).toBeNull();
  });
});

describe("buildDmarcRecord", () => {
  it("defaults to monitor mode (p=none), supports stricter policy + rua", () => {
    expect(buildDmarcRecord()).toBe("v=DMARC1; p=none");
    expect(buildDmarcRecord({ policy: "reject", rua: "dmarc@x.com" })).toBe("v=DMARC1; p=reject; rua=mailto:dmarc@x.com; fo=1");
  });
});

describe("parseHosts", () => {
  it("parses Namecheap host XML", () => {
    const xml = '<host Name="@" Type="MX" Address="aspmx.l.google.com." MXPref="1" TTL="1800" /><host Name="@" Type="TXT" Address="v=spf1 include:_spf.google.com ~all" TTL="1800" />';
    const hosts = parseHosts(xml);
    expect(hosts).toHaveLength(2);
    expect(hosts[0].type).toBe("MX");
    expect(hosts[1].address).toContain("spf1");
  });
});

describe("mergeDmarcHost — the safety guard (never wipes existing records)", () => {
  it("adds _dmarc TXT when missing, preserving existing records", () => {
    const existing = [{ name: "@", type: "MX", address: "aspmx.l.google.com.", mxPref: "1", ttl: "1800" }];
    const { hosts, added } = mergeDmarcHost(existing, "v=DMARC1; p=none");
    expect(added).toBe(true);
    expect(hosts).toHaveLength(2);
    expect(hosts[0]).toEqual(existing[0]);
    expect(hosts[1]).toMatchObject({ name: "_dmarc", type: "TXT", address: "v=DMARC1; p=none" });
  });

  it("is a no-op when _dmarc already present", () => {
    const existing = [{ name: "_dmarc", type: "TXT", address: "v=DMARC1; p=reject", mxPref: "10", ttl: "1800" }];
    const { hosts, added } = mergeDmarcHost(existing, "v=DMARC1; p=none");
    expect(added).toBe(false);
    expect(hosts).toBe(existing);
  });
});

describe("apiError", () => {
  it("returns null on OK and the message on error", () => {
    expect(apiError('<ApiResponse Status="OK"><CommandResponse/></ApiResponse>')).toBeNull();
    expect(apiError('<ApiResponse Status="ERROR"><Errors><Error Number="1">Invalid request IP</Error></Errors></ApiResponse>')).toBe("Invalid request IP");
  });
});
