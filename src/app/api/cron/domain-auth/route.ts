import { NextRequest, NextResponse } from "next/server";
import { ensureData } from "@/lib/data/store";
import { verifyAllDomains } from "@/lib/jobs/domain-auth";
import { integrations } from "@/lib/config";
import { cronAuthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: NextRequest) {
  const denied = cronAuthorized(req);
  if (denied) return denied;
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
