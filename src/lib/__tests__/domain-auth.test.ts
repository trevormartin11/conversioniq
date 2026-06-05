import { describe, it, expect } from "vitest";
import { parseSpf, parseDmarc, dkimPresent } from "@/lib/jobs/domain-auth";

describe("parseSpf", () => {
  it("detects SPF and whether it authorizes Google", () => {
    expect(parseSpf(["v=spf1 include:_spf.google.com ~all"])).toEqual({ present: true, google: true });
    expect(parseSpf(["v=spf1 include:mailgun.org ~all"])).toEqual({ present: true, google: false });
    expect(parseSpf(["some-other-txt-record"])).toEqual({ present: false, google: false });
    expect(parseSpf([])).toEqual({ present: false, google: false });
  });
});

describe("parseDmarc", () => {
  it("detects DMARC + extracts the policy", () => {
    expect(parseDmarc(["v=DMARC1; p=reject; rua=mailto:x@y.com"])).toEqual({ present: true, policy: "reject" });
    expect(parseDmarc(["v=DMARC1; p=none"])).toEqual({ present: true, policy: "none" });
    expect(parseDmarc([])).toEqual({ present: false, policy: null });
  });
});

describe("dkimPresent", () => {
  it("detects a published DKIM key", () => {
    expect(dkimPresent(["v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ"])).toBe(true);
    expect(dkimPresent([])).toBe(false);
    expect(dkimPresent(["not a dkim record"])).toBe(false);
  });
});
