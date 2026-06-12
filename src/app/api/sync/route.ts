import { NextRequest, NextResponse } from "next/server";
import { integrations } from "@/lib/config";
import { cronAuthorized } from "@/lib/api-auth";
import { runAllSyncs } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manual + cron sync trigger: pulls Instantly inboxes and Zoho leads into the
 * hub DB. Protected by SYNC_SECRET (Bearer). Wire to Vercel Cron alongside the
 * reply sync, or hit it from the dashboard's "Sync now".
 */
async function run(req: NextRequest) {
  // Accept either SYNC_SECRET (manual) or CRON_SECRET (Vercel Cron auto-bearer); fail-closed in prod.
  const denied = cronAuthorized(req);
  if (denied) return denied;
  if (!integrations.supabase) {
    return NextResponse.json({ ok: false, error: "supabase not configured" }, { status: 400 });
  }
  try {
    const res = await runAllSyncs();
    // ok:false must not ride a 200 — HTTP-status monitors never parse bodies.
    return NextResponse.json(res, { status: res.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
