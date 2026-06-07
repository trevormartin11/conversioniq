/**
 * Cost-meter data: the live self-metered usage (real-time, estimated) PLUS the actual billed cost
 * from Anthropic's org billing API (real dollars, when an admin key is configured). The meter shows
 * actual when available and falls back to the estimate otherwise. Both loaders never throw.
 */
import { aiSpendSummary, type AiSpendSummary } from "./usage";
import { fetchActualCost, type ActualCost } from "@/lib/integrations/anthropic-admin";

export interface CostMeterData {
  self: AiSpendSummary; // our own per-call metering (real-time pulse + per-purpose attribution)
  actual: ActualCost | null; // Anthropic-billed dollars (null until an admin key is set)
}

export async function loadCostMeter(): Promise<CostMeterData> {
  const [self, actual] = await Promise.all([aiSpendSummary(), fetchActualCost()]);
  return { self, actual: actual.available ? actual : null };
}
