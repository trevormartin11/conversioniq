/**
 * Anthropic Admin (organization) billing — ACTUAL billed cost via the Cost Report API, so the
 * meter can show real dollars instead of a token estimate.
 *
 * Requires a SEPARATE admin key (sk-ant-admin..., created by an org owner) in ANTHROPIC_ADMIN_API_KEY
 * — distinct from the per-request ANTHROPIC_API_KEY. The report is ORGANIZATION-scoped (every API key
 * in the org). To attribute cost to ONLY this app, run this app's key in its own Anthropic workspace
 * and set ANTHROPIC_WORKSPACE_ID — we then keep only that workspace's rows.
 *
 * Gated + fail-safe: no key / any error → { available:false }, and the meter falls back to live metering.
 * Wire facts (docs): GET https://api.anthropic.com/v1/organizations/cost_report, headers
 * x-api-key + anthropic-version: 2023-06-01, `amount` is in CENTS as a decimal string (÷100 = USD).
 */
import { httpJson } from "./http";

export const adminBillingAvailable = () => !!(process.env.ANTHROPIC_ADMIN_API_KEY || "").trim();

interface CostResult {
  amount?: string;
  currency?: string;
  model?: string | null;
  workspace_id?: string | null;
}
export interface CostBucket {
  starting_at?: string;
  ending_at?: string;
  results?: CostResult[];
}
interface CostReport {
  data?: CostBucket[];
  has_more?: boolean;
  next_page?: string;
}

export interface ActualCost {
  available: boolean;
  currency: string;
  monthToDateUsd: number;
  todayUsd: number;
  last7dUsd: number;
  byModelUsd: { model: string; usd: number }[];
  byDayUsd: { date: string; usd: number }[];
  scoped: boolean; // true when filtered to a configured workspace
  workspaceId: string | null;
  asOf: string;
}

function emptyActual(): ActualCost {
  return {
    available: false,
    currency: "USD",
    monthToDateUsd: 0,
    todayUsd: 0,
    last7dUsd: 0,
    byModelUsd: [],
    byDayUsd: [],
    scoped: false,
    workspaceId: (process.env.ANTHROPIC_WORKSPACE_ID || "").trim() || null,
    asOf: new Date().toISOString(),
  };
}

/** Pure aggregation of cost_report buckets → totals (testable; no I/O). `amount` is cents → ÷100. */
export function aggregateCost(
  buckets: CostBucket[],
  nowMs: number,
  workspaceId: string | null,
): Pick<ActualCost, "monthToDateUsd" | "todayUsd" | "last7dUsd" | "byModelUsd" | "byDayUsd"> {
  const todayStr = new Date(nowMs).toISOString().slice(0, 10);
  const sevenAgo = nowMs - 7 * 24 * 3600_000;
  let mtd = 0;
  let today = 0;
  let last7 = 0;
  const byModel = new Map<string, number>();
  const byDay = new Map<string, number>();
  for (const b of buckets) {
    const dayStr = (b.starting_at ?? "").slice(0, 10);
    const dayT = Date.parse(b.starting_at ?? "");
    for (const r of b.results ?? []) {
      // Scope to one workspace when configured (default-workspace rows report workspace_id null).
      if (workspaceId && (r.workspace_id ?? null) !== workspaceId) continue;
      const usd = (parseFloat(r.amount ?? "0") || 0) / 100;
      if (!usd) continue;
      mtd += usd;
      if (dayStr) byDay.set(dayStr, (byDay.get(dayStr) ?? 0) + usd);
      if (dayStr === todayStr) today += usd;
      if (Number.isFinite(dayT) && dayT >= sevenAgo) last7 += usd;
      const model = r.model || "other";
      byModel.set(model, (byModel.get(model) ?? 0) + usd);
    }
  }
  return {
    monthToDateUsd: mtd,
    todayUsd: today,
    last7dUsd: last7,
    byModelUsd: [...byModel.entries()].map(([model, usd]) => ({ model, usd })).sort((a, b) => b.usd - a.usd),
    byDayUsd: [...byDay.entries()].map(([date, usd]) => ({ date, usd })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// Billing data updates slowly (daily buckets) — cache within a warm instance to avoid hammering the API.
let cache: { at: number; value: ActualCost } | null = null;
const TTL_MS = 120_000;

/** Actual billed cost for the current month (UTC), from Anthropic's Cost Report API. Never throws. */
export async function fetchActualCost(): Promise<ActualCost> {
  const key = (process.env.ANTHROPIC_ADMIN_API_KEY || "").trim();
  if (!key) return emptyActual();
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const workspaceId = (process.env.ANTHROPIC_WORKSPACE_ID || "").trim() || null;
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const buckets: CostBucket[] = [];
    let page: string | undefined;
    for (let i = 0; i < 6; i++) {
      // Literal `group_by[]` brackets match Anthropic's array convention (kept verbatim by the URL parser).
      const qs =
        `starting_at=${encodeURIComponent(monthStart.toISOString())}` +
        `&bucket_width=1d&limit=31&group_by[]=workspace_id&group_by[]=description` +
        (page ? `&page=${encodeURIComponent(page)}` : "");
      const res = await httpJson<CostReport>(
        "anthropic-admin",
        `https://api.anthropic.com/v1/organizations/cost_report?${qs}`,
        { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, timeoutMs: 30000 },
      );
      buckets.push(...(res.data ?? []));
      if (!res.has_more || !res.next_page) break;
      page = res.next_page;
    }
    const agg = aggregateCost(buckets, Date.now(), workspaceId);
    const value: ActualCost = {
      available: true,
      currency: "USD",
      ...agg,
      scoped: !!workspaceId,
      workspaceId,
      asOf: new Date().toISOString(),
    };
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return emptyActual();
  }
}
