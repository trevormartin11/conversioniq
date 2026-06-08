import { NextRequest, NextResponse } from "next/server";
import { sendWeeklyReport } from "@/lib/jobs/digest";
import { cronAuthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: NextRequest) {
  const denied = cronAuthorized(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, ...(await sendWeeklyReport()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
