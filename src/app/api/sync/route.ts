import { NextRequest, NextResponse } from "next/server";
import { integrations } from "@/lib/config";
import { runAllSyncs } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manual + cron sync trigger: pulls Instantly inboxes and Zoho leads into the
 * hub DB. Protected by SYNC_SECRET (Bearer). Wire to Vercel Cron alongside the
 * reply sync, or hit it from the dashboard's "Sync now".
 */
async function run(req: NextRequest) {
  // Accept either SYNC_SECRET (manual) or CRON_SECRET (Vercel Cron auto-bearer).
  const auth = req.headers.get("authorization");
  const ok = (s?: string) => !!s && auth === `Bearer ${s}`;
  const gated = process.env.SYNC_SECRET || process.env.CRON_SECRET;
  if (gated && !ok(process.env.SYNC_SECRET) && !ok(process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!integrations.supabase) {
    return NextResponse.json({ ok: false, error: "supabase not configured" }, { status: 400 });
  }
  try {
    return NextResponse.json(await runAllSyncs());
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
