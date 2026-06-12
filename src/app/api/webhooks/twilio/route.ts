import { NextRequest, NextResponse } from "next/server";
import { ensureData, recordConsent, setConsentStatus } from "@/lib/data/store";
import { classifyInboundKeyword } from "@/lib/channels/policy";
import { verifyTwilioSignature } from "@/lib/integrations/twilio";
import { sendTelegram, tgEscape } from "@/lib/integrations/telegram";

export const runtime = "nodejs"; // needs node:crypto for signature verification

// Empty TwiML — a valid 200 that tells Twilio we have no auto-reply to add. Carrier-level
// + Messaging Service Advanced Opt-Out already send the STOP/START confirmation, so staying
// silent here avoids a double-text.
function twiml() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "content-type": "text/xml" },
  });
}

/**
 * Inbound Twilio SMS webhook — closes the consent loop. A recipient texting STOP (or any
 * carrier opt-out keyword) is recorded as opted_out, which permanently blocks future sends
 * and re-parks any queued drafts; START/YES re-subscribes. Configure this URL on your Twilio
 * number / Messaging Service. Every request is signature-verified (the Auth Token is the key),
 * because a forged request could otherwise opt a non-consenting number IN.
 */
export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  // Not configured (e.g. preview) — nothing to verify against and nothing to send, so no-op.
  if (!authToken) return NextResponse.json({ ok: true, ignored: "twilio not configured" });

  let params: Record<string, string> = {};
  try {
    const form = await req.formData();
    for (const [k, v] of form.entries()) params[k] = typeof v === "string" ? v : "";
  } catch {
    return NextResponse.json({ ok: false, error: "expected form-encoded body" }, { status: 400 });
  }

  // Reconstruct the public URL Twilio signed (Vercel terminates TLS, so trust forwarded headers).
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const url = `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (!verifyTwilioSignature(authToken, url, params, req.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 403 });
  }

  const from = (params.From ?? "").trim();
  const body = params.Body ?? "";
  const intent = classifyInboundKeyword(body);
  if (!from || !intent) return twiml(); // a normal inbound reply — no consent change

  await ensureData();
  const today = new Date().toISOString().slice(0, 10);
  // A STOP is a legally-mandated state change and Twilio does NOT redeliver failed inbound-SMS
  // webhooks — a single DB blip here would lose the opt-out forever and the next send would
  // text a number that opted out. Retry the write before giving up, and if it still fails,
  // alert the operator and answer 500 so the failure is at least visible in Twilio's logs.
  const attempt = async () => {
    if (intent === "opt_out") {
      // Blocks future sends + re-parks queued drafts to needs_consent (handled in recordConsent).
      await setConsentStatus("sms", from, "opted_out", "Twilio (inbound)", "reply_keyword");
    } else {
      // Re-subscribe. Safe to act on ONLY because the signature was verified above.
      await recordConsent(
        { channel: "sms", handle: from, status: "opted_in", source: "reply_keyword", proof: `Replied "${body.trim().slice(0, 40)}" via SMS on ${today}` },
        "Twilio (inbound)",
      );
    }
  };
  for (let tries = 0; ; tries++) {
    try {
      await attempt();
      break;
    } catch (e) {
      if (tries >= 2) {
        await sendTelegram(`🚨 SMS ${intent === "opt_out" ? "OPT-OUT" : "opt-in"} from ${tgEscape(from)} FAILED to record after 3 attempts: ${tgEscape((e as Error).message)}. Record it manually on the Channels page.`);
        return NextResponse.json({ ok: false, error: "consent write failed" }, { status: 500 });
      }
      await new Promise((r) => setTimeout(r, 250 * (tries + 1)));
    }
  }
  return twiml();
}
