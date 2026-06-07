"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, RefreshCw, BadgeCheck, Info } from "lucide-react";
import { getCostMeterAction } from "@/app/(dashboard)/costs/actions";
import type { CostMeterData } from "@/lib/ai/cost-meter";
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

const REFRESH_MS = 30_000;

function Bars({ rows, max }: { rows: { label: string; usd: number; calls?: number }[]; max: number }) {
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="w-40 shrink-0 truncate text-xs text-slate-400">{r.label}</div>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
            <div className="h-full rounded-full bg-brand-500/70" style={{ width: `${Math.min(100, (r.usd / max) * 100)}%` }} />
          </div>
          <div className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-slate-300">{usdFine(r.usd)}</div>
          {r.calls != null && <div className="w-14 shrink-0 text-right text-[11px] tabular-nums text-slate-600">{r.calls.toLocaleString()}×</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * Live meter of Claude API cost. When an org admin key is configured it shows ACTUAL billed dollars
 * (from Anthropic's Cost Report API); otherwise it shows our self-metered token estimate and prompts
 * to connect billing. Self-refreshes (paused while the tab is hidden) so it tracks spend over time.
 */
export function AiSpendMeter({ initial, softBudget }: { initial: CostMeterData; softBudget: number }) {
  const [data, setData] = useState<CostMeterData>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await getCostMeterAction());
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

  const { self, actual } = data;
  const headlineUsd = actual ? actual.monthToDateUsd : self.monthToDateUsd;
  const pctOfBudget = softBudget > 0 ? Math.min(100, (headlineUsd / softBudget) * 100) : 0;
  const over = softBudget > 0 && headlineUsd > softBudget;

  // Per-purpose: when we have actual dollars, apportion the real total by measured token share.
  const purposeShareTotal = self.byPurpose.reduce((s, p) => s + p.usd, 0);
  const purposeRows = (actual && purposeShareTotal > 0
    ? self.byPurpose.map((p) => ({ label: PURPOSE_LABEL[p.key] ?? p.key, usd: actual.monthToDateUsd * (p.usd / purposeShareTotal), calls: p.calls }))
    : self.byPurpose.map((p) => ({ label: PURPOSE_LABEL[p.key] ?? p.key, usd: p.usd, calls: p.calls })));
  const maxPurpose = Math.max(0.000001, ...purposeRows.map((p) => p.usd));

  const modelRows = actual ? actual.byModelUsd.map((m) => ({ label: m.model.replace(/^claude-/, ""), usd: m.usd })) : self.byModel.map((m) => ({ label: m.key.replace(/^claude-/, ""), usd: m.usd }));
  const maxModel = Math.max(0.000001, ...modelRows.map((m) => m.usd));

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
            <Activity className="h-4 w-4 text-brand-400" />
            Claude API cost
            {actual ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-ok/30 bg-ok/10 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-ok">
                <BadgeCheck className="h-3 w-3" /> Actual · billed by Anthropic
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-warn">
                <Info className="h-3 w-3" /> Estimate
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {actual
              ? actual.scoped
                ? `Real billed dollars, scoped to workspace ${actual.workspaceId}`
                : "Real billed dollars for your whole Anthropic organization (every API key)"
              : "Estimated from this app's token usage at list prices"}
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

      {/* Connect-billing prompt (only when we don't yet have actual dollars) */}
      {!actual && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/5 p-3 text-xs text-slate-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <div>
            <span className="font-medium text-warn">Showing an estimate.</span> To display your <span className="font-medium">actual billed cost</span>, add an Anthropic admin key
            (<code className="rounded bg-ink-900 px-1">ANTHROPIC_ADMIN_API_KEY</code>). To scope it to just this app, run this app&apos;s key in its own workspace and set{" "}
            <code className="rounded bg-ink-900 px-1">ANTHROPIC_WORKSPACE_ID</code>.
          </div>
        </div>
      )}

      <div className="card p-4 sm:p-5">
        {actual || self.available ? (
          <>
            {/* Headline + windows */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Month to date</div>
                <div className={`mt-1 font-mono text-3xl font-semibold leading-none tabular-nums sm:text-4xl ${over ? "text-bad" : "text-slate-100"}`}>
                  {usdFine(headlineUsd)}
                </div>
              </div>
              <div className="flex gap-5 text-right">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">{actual ? "Today" : "Last 24h"}</div>
                  <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-200">{usdFine(actual ? actual.todayUsd : self.last24hUsd)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Last 7d</div>
                  <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-200">{usdFine(actual ? actual.last7dUsd : self.last7dUsd)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Calls (MTD)</div>
                  <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-200">{self.mtdCalls.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Budget gauge */}
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>vs soft budget {usdFine(softBudget)}/mo {over ? "· over" : ""}</span>
                <span className="tabular-nums">{pctOfBudget.toFixed(0)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-ink-800">
                <div className={`h-full rounded-full ${over ? "bg-bad" : "bg-brand-500"}`} style={{ width: `${pctOfBudget}%` }} />
              </div>
            </div>

            {/* Where it's going */}
            {purposeRows.length > 0 && (
              <div className="mt-5 border-t border-ink-800 pt-4">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Where it&apos;s going (MTD){actual ? " · actual total split by measured token share" : ""}
                </div>
                <Bars rows={purposeRows} max={maxPurpose} />
              </div>
            )}

            {/* By model + live pulse */}
            <div className="mt-5 border-t border-ink-800 pt-4">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">By model (MTD)</div>
              <Bars rows={modelRows} max={maxModel} />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ink-800 pt-3 text-[11px] text-slate-600">
              <span>
                Live activity: {self.mtdCalls.toLocaleString()} calls metered this month · last call {ago(self.lastCallAt)}
              </span>
              {self.source === "mock" && <span>self-meter: mock (connect Supabase to persist)</span>}
            </div>
          </>
        ) : (
          <div className="py-6 text-center">
            <p className="text-sm font-medium text-slate-300">No Claude API activity yet this month.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              This fills as inbound replies get classified and you use AI features (strategy, copy, personalization).
            </p>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-600">
        {actual
          ? "Billed figures come from Anthropic's Cost Report and settle on their schedule (daily buckets, may lag a few hours). The live-activity line is metered here in real time. Classification runs on the cheap fast model; generative work uses the premium model."
          : "Estimate only — directional, not your invoice. Connect an admin key (above) for actual billed dollars."}
        {self.capped ? " Self-meter shows the most recent 5,000 calls." : ""}
      </p>
    </section>
  );
}
