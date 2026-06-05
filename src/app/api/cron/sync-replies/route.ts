import { NextRequest, NextResponse } from "next/server";
import { integrations } from "@/lib/config";
import { syncReplies } from "@/lib/sync/replies";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const ok = (s?: string) => !!s && auth === `Bearer ${s}`;
  const gated = process.env.SYNC_SECRET || process.env.CRON_SECRET;
  return !gated || ok(process.env.SYNC_SECRET) || ok(process.env.CRON_SECRET);
}

/** Frequent reply sync (every ~5 min): pull the unibox, classify, draft, queue. */
async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
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
