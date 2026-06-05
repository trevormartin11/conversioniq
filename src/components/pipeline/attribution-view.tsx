"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { num, pct, usd } from "@/lib/format";
import type { AttributionDim, AttributionRow } from "@/lib/data/queries";

const DIMS: { key: AttributionDim; label: string }[] = [
  { key: "vertical", label: "Vertical" },
  { key: "persona", label: "Persona" },
  { key: "source", label: "Source" },
  { key: "sendingDomain", label: "Sending domain" },
];

const COLS = "grid grid-cols-[1.4fr_repeat(5,minmax(0,1fr))] gap-2";

export function AttributionView({ data }: { data: Record<AttributionDim, AttributionRow[]> }) {
  const [dim, setDim] = useState<AttributionDim>("vertical");
  const rows = data[dim];
  const label = DIMS.find((d) => d.key === dim)?.label ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {DIMS.map((d) => (
          <button
            key={d.key}
            onClick={() => setDim(d.key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              dim === d.key ? "bg-brand-600 text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className={cn(COLS, "border-b border-ink-800 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500")}>
          <span>{label}</span>
          <span className="text-right">Leads</span>
          <span className="text-right">Positive</span>
          <span className="text-right">Demos</span>
          <span className="text-right">Closed</span>
          <span className="text-right">MRR</span>
        </div>
        <div className="divide-y divide-ink-800">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No leads yet — sourced leads land here, tagged by {label.toLowerCase()}.</p>
          ) : (
            rows.map((r) => (
              <div key={r.key} className={cn(COLS, "items-center px-4 py-2.5 text-sm")}>
                <span className="truncate text-slate-200" title={r.key}>{r.key}</span>
                <span className="text-right tabular-nums text-slate-300">{num(r.leads)}</span>
                <span className="text-right tabular-nums text-slate-300">{num(r.positive)}</span>
                <span className="text-right tabular-nums text-slate-300">{num(r.demos)}</span>
                <span className="text-right tabular-nums text-slate-100">
                  {num(r.closed)} {r.leads > 0 && <span className="text-[11px] text-slate-500">({pct(r.closeRate)})</span>}
                </span>
                <span className="text-right tabular-nums font-medium text-brand-300">{r.mrr ? usd(r.mrr) : "—"}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
