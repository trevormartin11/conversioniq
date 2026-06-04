import { NextRequest, NextResponse } from "next/server";
import { classifyReply } from "@/lib/ai/classify";
import { appConfig } from "@/lib/config";
import { sendTelegram } from "@/lib/integrations/telegram";

/**
 * Inbound Instantly webhook (preferred over polling for replies/bounces).
 * Configure this URL in Instantly and set INSTANTLY_WEBHOOK_SECRET to the shared
 * secret. Replies are classified immediately; hot ones ping Telegram.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INSTANTLY_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-webhook-secret") || req.nextUrl.searchParams.get("secret");
    if (provided !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const event = String(payload.event_type ?? payload.type ?? "unknown");

  switch (event) {
    case "reply_received":
    case "email_received": {
      const body = String(payload.body ?? payload.text ?? "");
      const from = String(payload.from ?? payload.lead_email ?? "");
      const { classification, confidence } = await classifyReply(body);
      // TODO(live): upsert reply, reconcile to lead, draft response, persist.
      if (appConfig.hotClasses.includes(classification as (typeof appConfig.hotClasses)[number])) {
        await sendTelegram(`🔥 *${classification}* reply from ${from}\n${body.slice(0, 240)}`);
      }
      return NextResponse.json({ ok: true, classification, confidence });
    }
    case "email_bounced":
    case "bounce": {
      // TODO(live): add to suppression (bounced) + Instantly blocklist.
      return NextResponse.json({ ok: true, handled: "bounce" });
    }
    default:
      return NextResponse.json({ ok: true, ignored: event });
  }
}
