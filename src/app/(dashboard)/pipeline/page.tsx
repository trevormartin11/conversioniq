import { Card, CardBody, SectionHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { PhaseBanner } from "@/components/ui/phase-banner";
import { pipeline, residual } from "@/lib/data/queries";
import { ensureData } from "@/lib/data/store";
import { num, pct, titleCase, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  await ensureData();
  const p = pipeline();
  const r = residual();
  const top = p.funnel[0]?.count || 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Pipeline & Residual</h1>
        <p className="text-sm text-slate-500">Funnel from contacted → closed, the demo tracker, and your 20%-split-3-ways residual.</p>
      </div>

      <PhaseBanner phase={3}>
        Full per-cell breakdowns (which vertical/persona/domain converts) and the weekly report land here. Demo states sync from Zoho.
      </PhaseBanner>

      {/* Funnel */}
      <section>
        <SectionHeader title="Funnel" subtitle="Cumulative — each stage includes everyone who passed it" />
        <Card>
          <CardBody className="space-y-2.5">
            {p.funnel.map((f) => (
              <div key={f.stage} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs text-slate-400">{titleCase(f.stage)}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-ink-800">
                  <div className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-brand-700 to-brand-500 px-2 text-[11px] font-medium text-white" style={{ width: `${Math.max(6, (f.count / top) * 100)}%` }}>
                    {f.count}
                  </div>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </section>

      {/* Demo tracker */}
      <section>
        <SectionHeader title="Demo tracker" subtitle="From Zoho" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Booked" value={num(p.demos.booked)} tone="brand" />
          <Stat label="Showed" value={num(p.demos.showed)} tone="ok" />
          <Stat label="No-show" value={num(p.demos.noShow)} tone="warn" />
          <Stat label="Closed" value={num(p.demos.closed)} tone="ok" />
        </div>
      </section>

      {/* Residual */}
      <section>
        <SectionHeader title="Residual & revenue" subtitle="20% recurring, split 3 ways" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Closed accounts" value={num(r.closedCount)} />
          <Stat label="Total client MRR" value={usd(r.totalMrr)} />
          <Stat label="Gross residual / mo" value={usd(r.grossMonthly)} sub={`${pct(r.grossRate)} of MRR`} tone="brand" />
          <Stat label="Your share / mo" value={usd(r.personalMonthly)} sub={`${pct(r.personalRate, 2)} (1 of 3)`} tone="ok" />
        </div>
        <Card className="mt-3">
          <CardBody className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-slate-400">Annualized run-rate</span>
            <span className="text-slate-200">Gross <span className="font-semibold text-brand-400">{usd(r.grossAnnual)}</span> · Your share <span className="font-semibold text-ok">{usd(r.personalAnnual)}</span></span>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
