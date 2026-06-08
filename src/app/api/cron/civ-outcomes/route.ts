import { NextRequest, NextResponse } from "next/server";
import { reconcileCivOutcomes } from "@/lib/jobs/civ-outcomes";
import { integrations } from "@/lib/config";
import { cronAuthorized } from "@/lib/api-auth";
import { ensureData } from "@/lib/data/store";

/**
 * Poll CIQ's Zoho for demo outcomes we may have missed via webhook, and fold won/lost back
 * into the lead lifecycle + residual. Secret-gated like the other cron/ops routes.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: NextRequest) {
  const denied = cronAuthorized(req);
  if (denied) return denied;
  if (!integrations.zohoCiq) return NextResponse.json({ ok: false, error: "zohoCiq not configured" }, { status: 400 });
  try {
    await ensureData();
    return NextResponse.json({ ok: true, ...(await reconcileCivOutcomes()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
