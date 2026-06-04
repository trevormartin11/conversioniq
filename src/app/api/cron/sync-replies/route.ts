import { NextRequest, NextResponse } from "next/server";
import { integrations } from "@/lib/config";
import { listEmails } from "@/lib/integrations/instantly";

/**
 * Scheduled fallback to the webhook: pull recent emails from the Instantly
 * unibox and reconcile. Wire to Vercel Cron (e.g. every 5 min). Protect with
 * CRON_SECRET. Falls back cleanly when Instantly isn't configured yet.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!integrations.instantly) {
    return NextResponse.json({ ok: true, skipped: "instantly not configured" });
  }
  try {
    const emails = await listEmails({ limit: "50" });
    // TODO(live): classify new replies, draft responses, persist, ping hot ones.
    return NextResponse.json({ ok: true, pulled: emails.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
