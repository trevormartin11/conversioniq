import { NextRequest, NextResponse } from "next/server";
import { checkConnections } from "@/lib/integrations/healthcheck";
import { cronAuthorized } from "@/lib/api-auth";

/**
 * Live integration self-test — actually pings each configured provider (read-only,
 * zero-cost) and reports whether the credentials work. Secret-protected like the other
 * ops endpoints; pass ?secret= or Authorization: Bearer <SYNC_SECRET|CRON_SECRET>.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const denied = cronAuthorized(req);
  if (denied) return denied;
  const results = await checkConnections();
  const ok = results.every((r) => r.ok !== false);
  return NextResponse.json({ ok, results, time: new Date().toISOString() }, { status: ok ? 200 : 500 });
}
