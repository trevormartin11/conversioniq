import { describe, it, expect, vi, afterEach } from "vitest";
import { sendSms, twilioSignature, verifyTwilioSignature } from "@/lib/integrations/twilio";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("twilio sendSms", () => {
  it("soft-fails without touching the network when not configured", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in tests"));
    const r = await sendSms({ to: "+14155550123", body: "hi" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not configured/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("POSTs to the Messages endpoint with Basic auth + form body and returns the sid", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15005550006");
    let captured: { url: string; init: RequestInit } | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      captured = { url: String(url), init: (init ?? {}) as RequestInit };
      return new Response(JSON.stringify({ sid: "SM999", status: "queued" }), { status: 201 });
    });

    const r = await sendSms({ to: "+14155550123", body: "hello there", from: "+15005550006" });

    expect(r.ok).toBe(true);
    expect(r.sid).toBe("SM999");
    expect(r.status).toBe("queued");
    expect(captured!.url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(captured!.init.method).toBe("POST");
    expect((captured!.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("AC123:tok").toString("base64")}`);
    const body = String(captured!.init.body);
    expect(body).toContain("To=%2B14155550123");
    expect(body).toContain("From=%2B15005550006");
    expect(body).toContain("Body=hello+there");
  });

  it("prefers a Messaging Service SID over From when set", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15005550006");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG777");
    let body = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      body = String((init as RequestInit).body);
      return new Response(JSON.stringify({ sid: "SM1", status: "accepted" }), { status: 201 });
    });
    const r = await sendSms({ to: "+14155550123", body: "hi", from: "+15005550006" });
    expect(r.ok).toBe(true);
    expect(body).toContain("MessagingServiceSid=MG777");
    expect(body).not.toContain("From=");
  });

  it("returns ok:false with Twilio's message on a per-message error_code", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15005550006");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sid: "SM2", status: "failed", error_code: 21610, error_message: "Attempt to send to unsubscribed recipient" }), { status: 201 }),
    );
    const r = await sendSms({ to: "+14155550123", body: "hi" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe(21610);
    expect(r.reason).toMatch(/unsubscribed/i);
  });

  it("surfaces an HTTP auth failure (bad creds) as a non-throwing failure", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "wrong");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15005550006");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: 20003, message: "Authentication Error - invalid credentials" }), { status: 401 }),
    );
    const r = await sendSms({ to: "+14155550123", body: "hi" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Authentication|20003|401/i);
  });
});

describe("twilioSignature (request validation)", () => {
  // Twilio's own documented example — proves the algorithm byte-for-byte.
  it("matches Twilio's published test vector", () => {
    const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
    const params = { Caller: "+14158675309", Digits: "1234", From: "+14158675309", To: "+18005551212", CallSid: "CA1234567890ABCDE" };
    expect(twilioSignature("12345", url, params)).toBe("RSOYDt4T1cUTdK1PDd93/VVr8B8=");
  });

  it("verifies a matching signature and rejects tampering / a missing header", () => {
    const url = "https://app.example.com/api/webhooks/twilio";
    const params = { From: "+14155550123", Body: "STOP", To: "+18005551212" };
    const sig = twilioSignature("tok", url, params);
    expect(verifyTwilioSignature("tok", url, params, sig)).toBe(true);
    // Tampered body (e.g. someone trying to forge an opt-in) no longer matches.
    expect(verifyTwilioSignature("tok", url, { ...params, Body: "START" }, sig)).toBe(false);
    expect(verifyTwilioSignature("tok", url, params, null)).toBe(false);
    expect(verifyTwilioSignature("wrong-token", url, params, sig)).toBe(false);
  });
});
