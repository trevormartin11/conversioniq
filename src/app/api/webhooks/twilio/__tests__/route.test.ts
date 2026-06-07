import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import { twilioSignature } from "@/lib/integrations/twilio";
import { getConsent } from "@/lib/data/store";
import { findConsent } from "@/lib/channels/policy";

const ENDPOINT = "https://app.example.com/api/webhooks/twilio";
const TOKEN = "test-token";

function makeReq(params: Record<string, string>, opts: { sign?: boolean; signature?: string } = {}) {
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
    host: "app.example.com",
    "x-forwarded-proto": "https",
  });
  if (opts.sign !== false) headers.set("x-twilio-signature", opts.signature ?? twilioSignature(TOKEN, ENDPOINT, params));
  return new NextRequest(ENDPOINT, { method: "POST", headers, body: new URLSearchParams(params).toString() });
}

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/twilio (inbound STOP/START)", () => {
  it("records an opt-out from a signature-verified STOP", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", TOKEN);
    const number = "+14155550181";
    const res = await POST(makeReq({ From: number, Body: "STOP", To: "+18005551212", MessageSid: "SM1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("xml");
    expect(findConsent(getConsent(), "sms", number)?.status).toBe("opted_out");
  });

  it("rejects a forged request (bad signature) with 403 and records nothing", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", TOKEN);
    const number = "+14155550182";
    // A forged opt-IN is the dangerous case — it must not get through without a valid signature.
    const res = await POST(makeReq({ From: number, Body: "START", To: "+18005551212" }, { signature: "ZGVhZGJlZWY=" }));
    expect(res.status).toBe(403);
    expect(findConsent(getConsent(), "sms", number)).toBeUndefined();
  });

  it("no-ops with 200 when Twilio isn't configured (no auth token)", async () => {
    const res = await POST(makeReq({ From: "+14155550183", Body: "STOP" }, { sign: false }));
    expect(res.status).toBe(200);
  });

  it("ignores a normal reply (no keyword) without changing consent", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", TOKEN);
    const number = "+14155550184";
    const res = await POST(makeReq({ From: number, Body: "Sounds great, talk then", To: "+18005551212" }));
    expect(res.status).toBe(200);
    expect(findConsent(getConsent(), "sms", number)).toBeUndefined();
  });
});
