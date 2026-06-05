"use client";

import { useState, useTransition } from "react";
import { Compass, MapPin, Database, Wallet, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { loadLeadsIntoCampaignAction, planSourcingAction, runSourcingAction } from "@/app/(dashboard)/leads/actions";
import type { SizeBand, SourcingPlan } from "@/lib/sourcing/types";

export interface PlannerCampaign { id: string; name: string; status: string; hasInstantly: boolean }

const BANDS: { v: "" | SizeBand; label: string }[] = [
  { v: "", label: "Auto-detect" },
  { v: "local_smb", label: "Local SMB" },
  { v: "mid_market", label: "Mid-market" },
  { v: "enterprise", label: "Enterprise $100M+" },
];

export function SourcingPlanner({ campaigns }: { campaigns: PlannerCampaign[] }) {
  const [vertical, setVertical] = useState("");
  const [geo, setGeo] = useState("");
  const [band, setBand] = useState<"" | SizeBand>("");
  const [count, setCount] = useState(500);
  const [budget, setBudget] = useState(50);
  const [plan, setPlan] = useState<SourcingPlan | null>(null);
  const [planning, startPlan] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof runSourcingAction>> | null>(null);
  const [running, startRun] = useTransition();
  const [loadCampaignId, setLoadCampaignId] = useState("");
  const [loadResult, setLoadResult] = useState<Awaited<ReturnType<typeof loadLeadsIntoCampaignAction>> | null>(null);
  const [loading, startLoad] = useTransition();

  const input = () => ({ vertical, geo, sizeBand: band || undefined, count: Number(count) || 100, budgetCap: Number(budget) || 50 });

  function doPlan() {
    setResult(null);
    startPlan(async () => {
      const r = await planSourcingAction(input());
      if (!r.ok) return toast.error(r.error);
      setPlan(r.plan);
    });
  }
  function doRun() {
    setLoadResult(null);
    startRun(async () => {
      const r = await runSourcingAction(input());
      setResult(r);
      if (!r.ok) toast.error(r.error ?? "Could not run sourcing.");
      else toast.success(`Sourced ${r.stats?.verified ?? 0} verified leads.`);
    });
  }
  function doLoad() {
    if (!result?.ok || !result.leads?.length || !loadCampaignId) return;
    const leads = result.leads;
    startLoad(async () => {
      const r = await loadLeadsIntoCampaignAction({ campaignId: loadCampaignId, leads });
      setLoadResult(r);
      if (!r.ok) toast.error(r.error ?? "Could not load leads.");
      else toast.success(`Loaded ${r.persisted} lead${r.persisted === 1 ? "" : "s"}${r.instantlyAdded ? ` · ${r.instantlyAdded} into Instantly` : ""}.`);
    });
  }

  const est = plan?.estimate;
  const isMaps = plan?.route.lane === "maps";

  return (
    <Card>
      <CardBody className="space-y-3">
        {/* inputs */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-400">Vertical</label>
            <input value={vertical} onChange={(e) => setVertical(e.target.value)} placeholder="e.g. Med spas, HVAC contractors, $200M logistics firms" className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400">Geography (optional)</label>
            <input value={geo} onChange={(e) => setGeo(e.target.value)} placeholder="United States" className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400">Size band</label>
            <select value={band} onChange={(e) => setBand(e.target.value as "" | SizeBand)} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none">
              {BANDS.map((b) => <option key={b.v} value={b.v}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400">How many leads</label>
            <input type="number" value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400">Budget cap ($)</label>
            <input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none" />
          </div>
        </div>
        <Button variant="primary" onClick={doPlan} disabled={planning || !vertical.trim()}>
          <Compass className="h-4 w-4" /> {planning ? "Routing…" : "Plan the run"}
        </Button>

        {/* plan */}
        {plan && est && (
          <div className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center gap-2">
              {isMaps ? <MapPin className="h-4 w-4 text-brand-300" /> : <Database className="h-4 w-4 text-brand-300" />}
              <span className="text-sm font-semibold text-slate-100">{isMaps ? "Google Maps lane" : "B2B database lane"}</span>
              <Tag tone="brand">{plan.route.provider}</Tag>
              {plan.route.needsEmailEnrichment && <Tag tone="slate">+ enrich</Tag>}
              <Tag tone="slate">+ verify</Tag>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">{plan.route.reason}</p>

            {/* cost */}
            <div className="rounded-lg border border-white/[0.06] bg-ink-950/50 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500"><Wallet className="h-3.5 w-3.5" /> Projected spend · {count} leads</div>
              <div className="mt-1.5 space-y-1">
                {est.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-slate-400">
                    <span>{l.step} <span className="text-slate-600">({l.provider})</span></span>
                    <span className="tabular-nums">${l.unit.toFixed(4)}/ea → ${l.total.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2 text-sm">
                <span className="font-medium text-slate-200">${est.costPerLead.toFixed(4)}/lead</span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-slate-100 tabular-nums">${est.projectedCost.toFixed(2)}</span>
                  <Tag tone={est.withinBudget ? "ok" : "bad"}>{est.withinBudget ? "within cap" : "over cap"}</Tag>
                </span>
              </div>
            </div>

            {/* run / readiness */}
            {plan.ready ? (
              <Button variant="ok" onClick={doRun} disabled={running || !est.withinBudget}>
                <Search className="h-4 w-4" /> {running ? "Sourcing…" : `Source ${count} leads`}
              </Button>
            ) : (
              <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-inset ring-warn/20">
                Add the <span className="font-semibold">{plan.missing.join(" + ")}</span> key{plan.missing.length > 1 ? "s" : ""} to activate this lane — the engine then runs search → {isMaps ? "enrich → " : ""}verify → dedupe end-to-end.
              </p>
            )}
          </div>
        )}

        {/* result */}
        {result?.ok && result.stats && (
          <div className="rounded-xl border border-ok/20 bg-ok/[0.04] p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["Sourced", result.stats.sourced],
                ["With email", result.stats.withEmail],
                ["Verified", result.stats.verified],
                ["Risky", result.stats.risky],
                ["Rejected", result.stats.rejected],
              ].map(([label, v]) => (
                <div key={label} className="text-center">
                  <p className="text-lg font-semibold tabular-nums text-slate-100">{v}</p>
                  <p className="text-[11px] text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* load into campaign — the spine: persist + attribute -> Zoho -> Instantly */}
        {result?.ok && (result.leads?.length ?? 0) > 0 && (
          <div className="space-y-2 rounded-xl border border-brand-500/20 bg-brand-500/[0.04] p-3">
            <p className="text-xs font-medium text-slate-300">
              Load {result.leads.length} deliverable lead{result.leads.length === 1 ? "" : "s"} → Zoho (canonical) + campaign
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={loadCampaignId}
                onChange={(e) => setLoadCampaignId(e.target.value)}
                className="h-9 min-w-[12rem] flex-1 rounded-lg border border-white/10 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
              >
                <option value="">Select a campaign…</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.hasInstantly ? "" : " · draft (Zoho only)"}</option>
                ))}
              </select>
              <Button variant="primary" onClick={doLoad} disabled={loading || !loadCampaignId}>
                <Upload className="h-4 w-4" /> {loading ? "Loading…" : "Load"}
              </Button>
            </div>
            {loadResult?.ok && (
              <p className="text-xs text-ok">
                ✓ Persisted {loadResult.persisted} · Zoho {loadResult.zohoCreated} · Instantly {loadResult.instantlyAdded}
                {loadResult.note ? ` — ${loadResult.note}` : ""}
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
