import { NextRequest, NextResponse } from "next/server";
import { integrations } from "@/lib/config";
import { cronAuthorized } from "@/lib/api-auth";
import { syncReplies } from "@/lib/sync/replies";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Frequent reply sync (every ~5 min): pull the unibox, classify, draft, queue. */
async function run(req: NextRequest) {
  const denied = cronAuthorized(req);
  if (denied) return denied;
  if (!integrations.instantly || !integrations.supabase) {
    return NextResponse.json({ ok: true, skipped: "instantly/supabase not configured" });
  }
  try {
    return NextResponse.json({ ok: true, ...(await syncReplies()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}

export const GET = run;
export const POST = run;
