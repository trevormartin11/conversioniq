import { NextRequest, NextResponse } from "next/server";
import { runAllSyncs } from "@/lib/sync";
import { enforceDeliverability } from "@/lib/jobs/deliverability";
import { verifyAllDomains } from "@/lib/jobs/domain-auth";
import { sendDailyBrief } from "@/lib/jobs/digest";
import { integrations } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const ok = (s?: string) => !!s && auth === `Bearer ${s}`;
  const gated = process.env.SYNC_SECRET || process.env.CRON_SECRET;
  return !gated || ok(process.env.SYNC_SECRET) || ok(process.env.CRON_SECRET);
}

/**
 * Combined daily maintenance (Hobby-friendly: one cron). Runs the full sync,
 * the live SPF/DKIM/DMARC re-check, the deliverability auto-pause sweep, and the
 * daily Telegram brief. The granular routes (/api/sync, /api/cron/*) remain for
 * manual runs or a Pro plan with more frequent schedules.
 */
async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const result: Record<string, unknown> = {};
  if (integrations.supabase) {
    try { result.sync = await runAllSyncs(); } catch (e) { result.syncError = (e as Error).message; }
    // Re-verify domain auth against live DNS so SPF/DKIM/DMARC reflect reality (sync seeds
    // dmarc:false; without this it never gets corrected). Runs after sync creates the domains.
    try { result.domainAuth = await verifyAllDomains(); } catch (e) { result.domainAuthError = (e as Error).message; }
    try { result.deliverability = await enforceDeliverability(); } catch (e) { result.deliverabilityError = (e as Error).message; }
  }
  try { result.brief = await sendDailyBrief(); } catch (e) { result.briefError = (e as Error).message; }
  return NextResponse.json({ ok: true, ...result });
}

export const GET = run;
export const POST = run;
