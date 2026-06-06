"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { saveAssumptionsAction } from "@/app/(dashboard)/settings/actions";

/**
 * Operator-set forward-projection assumptions (close rate + avg MRR). These drive ONLY the
 * illustrative projection on Pipeline — never inferred from CIQ's data.
 */
export function AssumptionsForm({ closeRate, monthlyMrr }: { closeRate: number; monthlyMrr: number }) {
  const [pct, setPct] = useState(Math.round(closeRate * 100).toString());
  const [mrr, setMrr] = useState(Math.round(monthlyMrr).toString());
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function save() {
    setErr(null);
    setSaved(false);
    start(async () => {
      const res = await saveAssumptionsAction({ closeRate: (Number(pct) || 0) / 100, monthlyMrr: Number(mrr) || 0 });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setErr(res.error || "Failed to save");
      }
    });
  }

  const inputCls =
    "mt-1 h-9 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none";
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="block">
        <span className="text-xs text-slate-500">Assumed close rate (%)</span>
        <input value={pct} onChange={(e) => setPct(e.target.value)} type="number" inputMode="decimal" min={0} max={100} className={inputCls} />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Assumed MRR per close ($)</span>
        <input value={mrr} onChange={(e) => setMrr(e.target.value)} type="number" inputMode="decimal" min={0} className={inputCls} />
      </label>
      <button
        onClick={save}
        disabled={pending}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 text-sm text-slate-200 transition-colors hover:border-ink-600 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4 text-ok" /> : null}
        {pending ? "Saving…" : saved ? "Saved" : "Save"}
      </button>
      {err && <p className="text-[11px] text-red-300 sm:col-span-3">{err}</p>}
    </div>
  );
}
