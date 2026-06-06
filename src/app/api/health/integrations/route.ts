import { NextRequest, NextResponse } from "next/server";
import { checkConnections } from "@/lib/integrations/healthcheck";

/**
 * Live integration self-test — actually pings each configured provider (read-only,
 * zero-cost) and reports whether the credentials work. Secret-protected like the other
 * ops endpoints; pass ?secret= or Authorization: Bearer <SYNC_SECRET|CRON_SECRET>.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const secret = process.env.SYNC_SECRET ?? process.env.CRON_SECRET;
  if (secret) {
    const provided =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.nextUrl.searchParams.get("secret");
    if (provided !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const results = await checkConnections();
  return NextResponse.json({
    ok: results.every((r) => r.ok !== false),
    results,
    time: new Date().toISOString(),
  });
}
