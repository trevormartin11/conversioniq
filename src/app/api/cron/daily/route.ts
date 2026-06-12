import { NextRequest, NextResponse } from "next/server";
import { ensureData } from "@/lib/data/store";
import { runAllSyncs } from "@/lib/sync";
import { enforceDeliverability } from "@/lib/jobs/deliverability";
import { runSubjectTuner } from "@/lib/ai/subject-tuner";
import { verifyAllDomains } from "@/lib/jobs/domain-auth";
import { syncCivCustomers } from "@/lib/jobs/civ-suppression";
import { sendDailyBrief } from "@/lib/jobs/digest";
import { integrations } from "@/lib/config";
import { cronAuthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Combined daily maintenance (Hobby-friendly: one cron). Runs the full sync,
 * the live SPF/DKIM/DMARC re-check, the deliverability auto-pause sweep, the
 * CIQ-customer suppression refresh (never pitch someone already in their funnel),
 * and the daily Telegram brief. The granular routes (/api/sync, /api/cron/*)
 * remain for manual runs or a Pro plan with more frequent schedules.
 */
async function run(req: NextRequest) {
  const denied = cronAuthorized(req);
  if (denied) return denied;
  const result: Record<string, unknown> = {};
  if (integrations.supabase) {
    try { result.sync = await runAllSyncs(); } catch (e) { result.syncError = (e as Error).message; }
    // Hydrate AFTER the sync so the store-reading jobs below (domain auth, deliverability,
    // CIQ suppression, brief) see today's data — without this they ran against the mock seed.
    await ensureData();
    // Re-verify domain auth against live DNS so SPF/DKIM/DMARC reflect reality (sync seeds
    // dmarc:false; without this it never gets corrected). Runs after sync creates the domains.
    try { result.domainAuth = await verifyAllDomains(); } catch (e) { result.domainAuthError = (e as Error).message; }
    try { result.deliverability = await enforceDeliverability(); } catch (e) { result.deliverabilityError = (e as Error).message; }
    // Subject A/B tuner: needs today's variant counters (synced above) + the hydrated store.
    try { result.subjectTuner = await runSubjectTuner(); } catch (e) { result.subjectTunerError = (e as Error).message; }
    if (integrations.zohoCiq) {
      try { result.civSuppression = await syncCivCustomers(); } catch (e) { result.civSuppressionError = (e as Error).message; }
    }
  }
  try { result.brief = await sendDailyBrief(); } catch (e) { result.briefError = (e as Error).message; }
  // Honest status: the route used to answer 200 {ok:true} even when every sub-job failed,
  // so cron monitors saw a permanently healthy day. Any *Error key (or a failed sync) flips
  // ok and the HTTP status, while still reporting everything that did run.
  const syncFailed = !!result.sync && (result.sync as { ok?: boolean }).ok === false;
  const failed = syncFailed || Object.keys(result).some((k) => k.endsWith("Error"));
  return NextResponse.json({ ok: !failed, ...result }, { status: failed ? 500 : 200 });
}

export const GET = run;
export const POST = run;
