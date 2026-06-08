import { NextRequest, NextResponse } from "next/server";
import { enforceDeliverability } from "@/lib/jobs/deliverability";
import { integrations } from "@/lib/config";
import { cronAuthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: NextRequest) {
  const denied = cronAuthorized(req);
  if (denied) return denied;
  if (!integrations.supabase) return NextResponse.json({ ok: false, error: "supabase not configured" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await enforceDeliverability()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
