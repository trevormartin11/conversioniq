/**
 * AI usage metering — records every Claude completion's token usage + estimated cost so the
 * Costs page can show a LIVE meter of what we're spending on the API. Writes to Supabase in
 * live mode and always keeps a small in-memory buffer (mock/dev + warm-instance fallback).
 *
 * Recording is best-effort by design: it must NEVER throw into, or meaningfully slow, a
 * completion. If the DB is down or the table isn't migrated yet, we degrade to the buffer.
 */
import { DATA_MODE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/data/supabase";
import { costUsd } from "./pricing";

export type AiPurpose =
  | "classification"
  | "drafting"
  | "copy"
  | "sequence"
  | "strategy"
  | "personalization"
  | "next_moves"
  | "channel"
  | "other";

export interface AiUsageEvent {
  id: string;
  createdAt: string;
  model: string;
  purpose: AiPurpose;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
}

export interface RecordInput {
  model: string;
  purpose: AiPurpose;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

const MEM_CAP = 2000;
const mem: AiUsageEvent[] = [];

/** Record one completion's usage. Never throws; awaited by complete() but failure-tolerant. */
export async function recordAiUsage(input: RecordInput): Promise<void> {
  try {
    const ev: AiUsageEvent = {
      id: `aiu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      model: input.model,
      purpose: input.purpose,
      inputTokens: input.inputTokens || 0,
      outputTokens: input.outputTokens || 0,
      cacheReadTokens: input.cacheReadTokens || 0,
      cacheCreationTokens: input.cacheCreationTokens || 0,
      costUsd: costUsd(input.model, {
        input: input.inputTokens || 0,
        output: input.outputTokens || 0,
        cacheRead: input.cacheReadTokens || 0,
        cacheWrite: input.cacheCreationTokens || 0,
      }),
    };
    mem.unshift(ev);
    if (mem.length > MEM_CAP) mem.length = MEM_CAP;
    if (DATA_MODE === "live") {
      const { error } = await supabaseAdmin().from("ai_usage").insert({
        id: ev.id,
        created_at: ev.createdAt,
        model: ev.model,
        purpose: ev.purpose,
        input_tokens: ev.inputTokens,
        output_tokens: ev.outputTokens,
        cache_read_tokens: ev.cacheReadTokens,
        cache_creation_tokens: ev.cacheCreationTokens,
        cost_usd: ev.costUsd,
      });
      if (error && process.env.NODE_ENV !== "production") console.warn(`[ai_usage] insert: ${error.message}`);
    }
  } catch (e) {
    if (process.env.NODE_ENV !== "production") console.warn(`[ai_usage] record failed: ${(e as Error).message}`);
  }
}

export interface SpendBucket {
  key: string;
  usd: number;
  calls: number;
}

export interface AiSpendSummary {
  source: "live" | "mock";
  available: boolean;
  monthToDateUsd: number;
  last24hUsd: number;
  last7dUsd: number;
  mtdCalls: number;
  byPurpose: SpendBucket[];
  byModel: SpendBucket[];
  recent: AiUsageEvent[];
  lastCallAt: string | null;
  capped: boolean;
  asOf: string;
}

function startOfMonthUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** Pure aggregation of usage events into the meter summary (testable, no I/O). */
export function summarize(events: AiUsageEvent[], now: number, source: "live" | "mock", capped: boolean): AiSpendSummary {
  const monthStart = startOfMonthUtc(new Date(now));
  const t24 = now - 24 * 3600_000;
  const t7 = now - 7 * 24 * 3600_000;
  let mtd = 0;
  let h24 = 0;
  let d7 = 0;
  let mtdCalls = 0;
  const purpose = new Map<string, SpendBucket>();
  const model = new Map<string, SpendBucket>();
  for (const e of events) {
    const t = Date.parse(e.createdAt);
    if (Number.isNaN(t)) continue;
    if (t >= t24) h24 += e.costUsd;
    if (t >= t7) d7 += e.costUsd;
    if (t >= monthStart) {
      mtd += e.costUsd;
      mtdCalls++;
      const p = purpose.get(e.purpose) ?? { key: e.purpose, usd: 0, calls: 0 };
      p.usd += e.costUsd;
      p.calls++;
      purpose.set(e.purpose, p);
      const m = model.get(e.model) ?? { key: e.model, usd: 0, calls: 0 };
      m.usd += e.costUsd;
      m.calls++;
      model.set(e.model, m);
    }
  }
  const sorted = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    source,
    available: events.length > 0,
    monthToDateUsd: mtd,
    last24hUsd: h24,
    last7dUsd: d7,
    mtdCalls,
    byPurpose: [...purpose.values()].sort((a, b) => b.usd - a.usd),
    byModel: [...model.values()].sort((a, b) => b.usd - a.usd),
    recent: sorted.slice(0, 12),
    lastCallAt: sorted[0]?.createdAt ?? null,
    capped,
    asOf: new Date(now).toISOString(),
  };
}

/** Current live spend summary — from Supabase in live mode, the buffer otherwise. */
export async function aiSpendSummary(): Promise<AiSpendSummary> {
  const now = Date.now();
  if (DATA_MODE !== "live") return summarize(mem, now, "mock", false);
  try {
    // Fetch far enough back to cover both windows (the 7-day window can reach into last month).
    const since = new Date(Math.min(startOfMonthUtc(new Date(now)), now - 7 * 24 * 3600_000)).toISOString();
    const LIMIT = 5000;
    const { data, error } = await supabaseAdmin()
      .from("ai_usage")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (error) throw new Error(error.message);
    const rows = (data as Record<string, unknown>[]) ?? [];
    const events: AiUsageEvent[] = rows.map((r) => ({
      id: String(r.id),
      createdAt: String(r.created_at),
      model: String(r.model),
      purpose: (String(r.purpose) || "other") as AiPurpose,
      inputTokens: Number(r.input_tokens) || 0,
      outputTokens: Number(r.output_tokens) || 0,
      cacheReadTokens: Number(r.cache_read_tokens) || 0,
      cacheCreationTokens: Number(r.cache_creation_tokens) || 0,
      costUsd: Number(r.cost_usd) || 0,
    }));
    return summarize(events, now, "live", rows.length >= LIMIT);
  } catch {
    // DB unreachable or table not migrated yet — show whatever this instance buffered.
    return summarize(mem, now, "live", false);
  }
}
