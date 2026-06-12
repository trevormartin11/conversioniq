/** Orchestrates the data syncs (Instantly + Zoho -> hub DB) + records job runs. */
import { supabaseAdmin } from "@/lib/data/supabase";
import { syncInboxes } from "./inboxes";
import { syncCampaigns } from "./campaigns";
import { syncLeads } from "./leads";
import { syncReplies } from "./replies";
import { syncMetrics } from "./metrics";
import { syncVariantMetrics } from "./variant-metrics";

async function recordJob(job: string, status: "ok" | "error", startedAt: number, error?: string) {
  try {
    await supabaseAdmin().from("job_runs").upsert(
      { id: `j_${job}`, job, status, last_run_at: new Date().toISOString(), next_run_at: null, duration_ms: Date.now() - startedAt, error: error ?? null },
      { onConflict: "id" },
    );
  } catch {
    // job_runs is best-effort telemetry
  }
}

export async function runAllSyncs() {
  const result: Record<string, unknown> = {};
  const errors: string[] = [];
  // Order matters: inboxes/domains + campaigns + leads before replies (FK refs).
  const steps: [string, () => Promise<unknown>][] = [
    ["inboxes", syncInboxes],
    ["campaigns", syncCampaigns],
    ["leads", syncLeads],
    ["replies", syncReplies],
    ["metrics", syncMetrics],
    ["variant_metrics", syncVariantMetrics],
  ];
  for (const [name, fn] of steps) {
    const t = Date.now();
    try {
      result[name] = await fn();
      await recordJob(`sync_${name}`, "ok", t);
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`${name}: ${msg}`);
      await recordJob(`sync_${name}`, "error", t, msg);
    }
  }
  return { ok: errors.length === 0, ...result, errors, ranAt: new Date().toISOString() };
}
