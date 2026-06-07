"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { getAiSpendAction } from "@/app/(dashboard)/costs/actions";
import type { AiSpendSummary } from "@/lib/ai/usage";
import { usdFine, ago } from "@/lib/format";

const PURPOSE_LABEL: Record<string, string> = {
  classification: "Reply classification",
  drafting: "Reply drafts",
  copy: "Copy coach",
  sequence: "Sequence generation",
  strategy: "Strategy suggestions",
  personalization: "Personalization",
  next_moves: "Next moves",
  other: "Other",
};

const REFRESH_MS = 20_000;

/**
 * Live meter of Claude API spend (estimated from token usage at list prices). First paint uses the
 * server-computed summary; it then self-refreshes every 20s (paused while the tab is hidden) so it
 * reflects classification calls firing on the cron and any AI features you use, in near real time.
 */
export function AiSpendMeter({ initial, softBudget }: { initial: AiSpendSummary; softBudget: number }) {
  const [s, setS] = useState<AiSpendSummary>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setS(await getAiSpendAction());
    } catch {
      /* keep last good snapshot */
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) void refresh();
    };
    timer.current = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  const pctOfBudget = softBudget > 0 ? Math.min(100, (s.monthToDateUsd / softBudget) * 100) : 0;
  const over = s.monthToDateUsd > softBudget && softBudget > 0;
  const maxPurpose = Math.max(0.000001, ...s.byPurpose.map((p) => p.usd));

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
            <Activity className="h-4 w-4 text-brand-400" />
            Claude API — live spend
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Measured from token usage · updates every 20s{s.source === "mock" ? " · mock (connect Supabase to persist)" : ""}
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-ink-600 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="card p-4 sm:p-5">
        {!s.available ? (
          <div className="py-6 text-center">
            <p className="text-sm font-medium text-slate-300">No Claude API calls recorded yet this month.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              The meter fills as inbound replies get classified and you use AI features (strategy, copy, personalization).
            </p>
          </div>
        ) : (
          <>
            {/* Headline + budget gauge */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Month to date</div>
                <div className={`mt-1 font-mono text-3xl font-semibold leading-none tabular-nums sm:text-4xl ${over ? "text-bad" : "text-slate-100"}`}>
                  {usdFine(s.monthToDateUsd)}
                </div>
              </div>
              <div className="flex gap-5 text-right">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Last 24h</div>
                  <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-200">{usdFine(s.last24hUsd)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Last 7d</div>
                  <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-200">{usdFine(s.last7dUsd)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Calls (MTD)</div>
                  <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-200">{s.mtdCalls.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>vs soft budget {usdFine(softBudget)}/mo {over ? "· over" : ""}</span>
                <span className="tabular-nums">{pctOfBudget.toFixed(0)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-ink-800">
                <div className={`h-full rounded-full ${over ? "bg-bad" : "bg-brand-500"}`} style={{ width: `${pctOfBudget}%` }} />
              </div>
            </div>

            {/* By purpose */}
            {s.byPurpose.length > 0 && (
              <div className="mt-5 border-t border-ink-800 pt-4">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">Spend by purpose (MTD)</div>
                <div className="space-y-1.5">
                  {s.byPurpose.map((p) => (
                    <div key={p.key} className="flex items-center gap-3">
                      <div className="w-40 shrink-0 truncate text-xs text-slate-400">{PURPOSE_LABEL[p.key] ?? p.key}</div>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                        <div className="h-full rounded-full bg-brand-500/70" style={{ width: `${Math.min(100, (p.usd / maxPurpose) * 100)}%` }} />
                      </div>
                      <div className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-slate-300">{usdFine(p.usd)}</div>
                      <div className="w-14 shrink-0 text-right text-[11px] tabular-nums text-slate-600">{p.calls.toLocaleString()}×</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* By model + last call */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ink-800 pt-3">
              <div className="flex flex-wrap gap-1.5">
                {s.byModel.map((m) => (
                  <span key={m.key} className="rounded-full border border-ink-700 bg-ink-900/60 px-2 py-0.5 text-[11px] text-slate-400">
                    {m.key.replace(/^claude-/, "")} · <span className="font-mono tabular-nums text-slate-300">{usdFine(m.usd)}</span>
                  </span>
                ))}
              </div>
              <span className="text-[11px] text-slate-600">Last call {ago(s.lastCallAt)}</span>
            </div>
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Estimated from token usage at list prices — directional, not your exact invoice. Classification runs on the cheap fast model; generative work uses the premium model.
        {s.capped ? " Showing the most recent 5,000 calls." : ""}
      </p>
    </section>
  );
}
