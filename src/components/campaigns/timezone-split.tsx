"use client";

import { useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import {
  executeTimezoneSplitAction,
  previewTimezoneSplitAction,
  type TzSplitPlanRow,
  type TzSplitResultRow,
} from "@/app/(dashboard)/campaigns/push-actions";

/**
 * Split a campaign into per-timezone draft sub-campaigns so each recipient is sent in their
 * own optimal local window. Preview first; execute creates drafts (never auto-sent).
 */
export function TimezoneSplit({ campaignId }: { campaignId: string }) {
  const [plan, setPlan] = useState<{ rows: TzSplitPlanRow[]; unknown: number; hasSequence: boolean } | null>(null);
  const [results, setResults] = useState<TzSplitResultRow[] | null>(null);
  const [busy, setBusy] = useState<"" | "plan" | "exec">("");
  const [err, setErr] = useState<string | null>(null);

  async function preview() {
    setBusy("plan");
    setErr(null);
    setResults(null);
    try {
      setPlan(await previewTimezoneSplitAction(campaignId));
    } catch {
      setErr("Couldn't build the plan — try again.");
    } finally {
      setBusy("");
    }
  }
  async function execute() {
    setBusy("exec");
    setErr(null);
    try {
      const r = await executeTimezoneSplitAction(campaignId);
      if (!r.ok && r.error) setErr(r.error);
      setResults(r.results);
    } catch {
      setErr("Split failed — try again.");
    } finally {
      setBusy("");
    }
  }

  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-ink-600 disabled:opacity-50";
  return (
    <div className="space-y-3">
      <button onClick={preview} disabled={!!busy} className={btn}>
        {busy === "plan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4 text-brand-400" />}
        Preview timezone split
      </button>

      {plan && (
        <div className="space-y-2">
          {plan.rows.length === 0 ? (
            <p className="text-[11px] text-slate-500">No leads with a known timezone on this campaign yet.</p>
          ) : (
            <>
              <div className="divide-y divide-ink-800 overflow-hidden rounded-lg border border-ink-700">
                {plan.rows.map((r) => (
                  <div key={r.tz} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="text-slate-200">{r.label} <span className="text-slate-500">· {r.count} lead{r.count === 1 ? "" : "s"}</span></span>
                    <span className="text-[11px] text-slate-500">{r.window} · {r.zone}</span>
                  </div>
                ))}
              </div>
              {plan.unknown > 0 && <p className="text-[11px] text-slate-500">{plan.unknown} lead{plan.unknown === 1 ? "" : "s"} with an unknown timezone stay in the base campaign.</p>}
              {!plan.hasSequence && <p className="text-[11px] text-warn">Add sequence copy before splitting.</p>}
              <button onClick={execute} disabled={!!busy || !plan.hasSequence || plan.rows.length === 0} className={btn}>
                {busy === "exec" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Create {plan.rows.length} timezone campaign{plan.rows.length === 1 ? "" : "s"}
              </button>
            </>
          )}
        </div>
      )}

      {results && (
        <div className="space-y-1">
          {results.map((r, i) => (
            <p key={i} className={`text-[11px] ${r.ok ? "text-ok" : "text-red-300"}`}>
              {r.ok ? `✓ ${r.label} → draft created (${r.leads} leads loaded)` : `✕ ${r.label} — ${r.error}`}
            </p>
          ))}
          <p className="text-[11px] text-slate-500">Created as drafts — review + launch each. Run once to avoid duplicates.</p>
        </div>
      )}

      {err && <p className="text-[11px] text-red-300">{err}</p>}
      <p className="text-[11px] text-slate-500">Beta — one draft campaign per timezone (same sequence + inboxes), each scheduled for that zone&apos;s optimal local window. Nothing sends until you launch each.</p>
    </div>
  );
}
