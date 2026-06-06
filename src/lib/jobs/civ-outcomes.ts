import { getDemos, recordDemoOutcome } from "@/lib/data/store";
import { getCivDealOutcome } from "@/lib/integrations/zoho-civ";
import { classifyStage } from "@/lib/outcome";

/**
 * Poll-side reconciliation of CIQ deal outcomes. The webhook is primary, but webhooks get
 * missed (workflow misconfig, transient 500s) — so for every demo we've handed to CIQ
 * (has a civDealId) that hasn't reached a terminal state, read its Deal stage and record
 * won/lost. Idempotent: demos already closed/lost are filtered out, so re-runs are no-ops.
 */
export async function reconcileCivOutcomes(): Promise<{
  checked: number;
  won: number;
  lost: number;
  pending: number;
}> {
  const open = getDemos().filter((d) => d.civDealId && d.status !== "closed" && d.status !== "lost");
  let won = 0;
  let lost = 0;
  let pending = 0;
  for (const demo of open) {
    const outcome = await getCivDealOutcome(demo.civDealId!);
    const cls = classifyStage(outcome?.stage);
    if (!cls) {
      pending++;
      continue;
    }
    if (cls === "won") {
      await recordDemoOutcome(demo.id, { result: "won", mrr: outcome?.amount ?? undefined }, "ConversionIQ (reconcile)");
      won++;
    } else {
      // The structured loss reason flows in via the webhook; a polled "lost" lands as "other".
      await recordDemoOutcome(demo.id, { result: "lost", reason: "other" }, "ConversionIQ (reconcile)");
      lost++;
    }
  }
  return { checked: open.length, won, lost, pending };
}
