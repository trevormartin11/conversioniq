import { NextRequest, NextResponse } from "next/server";
import { classifyReply } from "@/lib/ai/classify";
import { appConfig, integrations } from "@/lib/config";
import { addSuppression, ensureData, isSuppressed, recordInboxBounce } from "@/lib/data/store";
import { addToBlocklist } from "@/lib/integrations/instantly";
import { sendTelegram, tgEscape } from "@/lib/integrations/telegram";
import { syncReplies, bodyText } from "@/lib/sync/replies";
import { webhookAuthorized } from "@/lib/api-auth";

export const maxDuration = 60;

/**
 * Inbound Instantly webhook (preferred over polling for replies/bounces).
 * Configure this URL in Instantly and set INSTANTLY_WEBHOOK_SECRET to the shared
 * secret. Replies are classified immediately; hot ones ping Telegram.
 */
export async function POST(req: NextRequest) {
  const denied = webhookAuthorized(req, "INSTANTLY_WEBHOOK_SECRET");
  if (denied) return denied;

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // Only a string event type is meaningful — an array like ["reply_received"] must NOT be
  // String()-coerced into a real reply that smuggles past the switch.
  const rawEvent = payload.event_type ?? payload.type;
  const event = typeof rawEvent === "string" ? rawEvent : "unknown";

  switch (event) {
    case "reply_received":
    case "email_received": {
      // Route through the same bodyText() the sync path uses, so the documented {html,text}
      // object shape is handled (not String()-coerced to "[object Object]" and misclassified).
      const body = bodyText(payload.body ?? payload.text);
      const from = String(payload.from ?? payload.lead_email ?? "");
      // Live: delegate to the canonical sync path so the reply is classified, drafted,
      // persisted, auto-handled and hot-pinged exactly like the cron — no divergence. We
      // pull a small recent window (not the full 1000) since we're reacting to one event.
      if (integrations.instantly && integrations.supabase) {
        try {
          const res = await syncReplies(100);
          return NextResponse.json({ ok: true, mode: "synced", ...res });
        } catch {
          /* fall through to lightweight handling below */
        }
      }
      // No DB (preview) or the sync failed: classify + hot-ping so nothing's silently dropped.
      const { classification, confidence } = await classifyReply(body);
      if (from && appConfig.hotClasses.includes(classification as (typeof appConfig.hotClasses)[number])) {
        await sendTelegram(`🔥 *${classification}* reply from ${tgEscape(from)}\n${tgEscape(body.slice(0, 240))}`);
      }
      return NextResponse.json({ ok: true, mode: "classified", classification, confidence });
    }
    case "email_bounced":
    case "bounce": {
      const email = String(payload.lead_email ?? payload.email ?? payload.from ?? "").trim().toLowerCase();
      const eaccount = String(payload.eaccount ?? payload.account ?? payload.sending_account ?? "").trim();
      if (!email.includes("@")) return NextResponse.json({ ok: true, handled: "bounce", note: "no email in payload" });
      await ensureData();
      // 1) Never email a bounced address again — suppression universe + sending-layer blocklist.
      if (!isSuppressed(email).suppressed) {
        await addSuppression({ email, domain: null, reason: "bounced", source: "instantly:webhook", leadId: null, note: "Hard bounce (webhook)" }, "system");
      }
      if (integrations.instantly) {
        try { await addToBlocklist([email]); } catch { /* best-effort sending-layer block */ }
      }
      // 2) Feed the sending inbox's bounce rate so the inbox-level guardrail can trip.
      if (eaccount) await recordInboxBounce(eaccount);
      return NextResponse.json({ ok: true, handled: "bounce", suppressed: email });
    }
    default:
      return NextResponse.json({ ok: true, ignored: event });
  }
}
