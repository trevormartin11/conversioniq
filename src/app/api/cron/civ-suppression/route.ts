import { NextRequest, NextResponse } from "next/server";
import { syncCivCustomers } from "@/lib/jobs/civ-suppression";
import { integrations } from "@/lib/config";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const ok = (s?: string) => !!s && auth === `Bearer ${s}`;
  const gated = process.env.SYNC_SECRET || process.env.CRON_SECRET;
  return !gated || ok(process.env.SYNC_SECRET) || ok(process.env.CRON_SECRET);
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!integrations.supabase) return NextResponse.json({ ok: false, error: "supabase not configured" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await syncCivCustomers()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
