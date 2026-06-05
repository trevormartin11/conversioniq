import { NextRequest, NextResponse } from "next/server";
import { ensureData } from "@/lib/data/store";
import { verifyAllDomains } from "@/lib/jobs/domain-auth";
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
  await ensureData();
  try {
    return NextResponse.json({ ok: true, ...(await verifyAllDomains()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
