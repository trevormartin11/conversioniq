/**
 * Twilio SMS — the real send path for the consent-gated SMS channel.
 *
 * This is ONLY ever called after the consent + daily-cap gate has already passed
 * (sendOutreach enforces that). It never decides policy; it just puts a text on the
 * wire. Off until keyed — callers fall back to a simulated send when not configured.
 *
 * Docs: POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
 *       Basic auth (AccountSID:AuthToken), application/x-www-form-urlencoded body.
 */
import { httpJson } from "./http";

export interface SmsResult {
  ok: boolean;
  sid?: string;
  status?: string; // Twilio message status (queued|sending|sent|...)
  reason?: string;
  code?: number; // Twilio error code (e.g. 21610 = recipient opted out)
}

interface TwilioMessageResource {
  sid?: string;
  status?: string;
  error_code?: number | null;
  error_message?: string | null;
}

/**
 * Send one SMS. `from` defaults to TWILIO_FROM_NUMBER; if a Messaging Service SID is
 * configured it takes precedence (the recommended A2P 10DLC path — Twilio picks the number).
 * Reads credentials at call time so it's testable and reflects live env without a reload.
 */
export async function sendSms(input: { to: string; body: string; from?: string }): Promise<SmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !token) return { ok: false, reason: "twilio not configured" };

  const messagingService = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const from = input.from?.trim() || process.env.TWILIO_FROM_NUMBER?.trim();
  if (!messagingService && !from) return { ok: false, reason: "no Twilio sender (set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID)" };

  const params = new URLSearchParams({ To: input.to, Body: input.body });
  if (messagingService) params.set("MessagingServiceSid", messagingService);
  else params.set("From", from!);

  try {
    const msg = await httpJson<TwilioMessageResource>("twilio", `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${token}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    // A submit usually returns 201 with a queued status; a synchronous rejection rides in error_code.
    if (msg.error_code) return { ok: false, sid: msg.sid, code: msg.error_code, reason: msg.error_message || `Twilio error ${msg.error_code}` };
    return { ok: true, sid: msg.sid, status: msg.status };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
