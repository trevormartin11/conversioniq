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
  const secret = process.env.SYNC_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
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
