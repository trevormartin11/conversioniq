import Link from "next/link";
import { Card, CardBody, PageHeader, SectionHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { pipeline, residual, outcomeLoop, projection } from "@/lib/data/queries";
import { ensureData, getDemos, getLead } from "@/lib/data/store";
import { DemoTracker, type DemoRow } from "@/components/pipeline/demo-tracker";
import { num, pct, titleCase, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  await ensureData(["demos", "leads", "replies", "metrics", "campaigns"]);
  const p = pipeline();
  const r = residual();
  const loop = outcomeLoop();
  const proj = projection();
  const top = p.funnel[0]?.count || 1;
  const demoRows: DemoRow[] = getDemos().map((d) => {
    const lead = getLead(d.leadId);
    return {
      id: d.id,
      leadName: lead ? `${lead.firstName} ${lead.lastName}`.trim() || lead.company : "(unknown)",
      company: lead?.company ?? "",
      scheduledAt: d.scheduledAt,
      status: d.status,
      owner: d.owner,
      mrr: d.mrr,
      outcomeReason: d.outcomeReason,
      civDealId: d.civDealId,
      reminderSentAt: d.reminderSentAt,
    };
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Pipeline & Residual" subtitle="Funnel from contacted → closed, the demo tracker, and your 20%-split-3-ways residual." />

      {/* Funnel */}
      <section>
        <SectionHeader title="Funnel" subtitle="Cumulative — each stage includes everyone who passed it" />
        <Card>
          <CardBody className="space-y-2.5">
            {p.funnel.map((f, i) => {
              const prev = i > 0 ? p.funnel[i - 1].count : f.count;
              const conv = prev > 0 ? f.count / prev : 0;
              return (
                <div key={f.stage} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-slate-400 sm:w-28">{titleCase(f.stage)}</span>
                  <div className="h-7 flex-1 overflow-hidden rounded-md bg-white/5">
                    <div className="h-full rounded-md bg-gradient-to-r from-brand-600 to-brand-400" style={{ width: `${Math.max(2, top > 0 ? (f.count / top) * 100 : 0)}%`, opacity: 1 - i * 0.08 }} />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums text-slate-100">{f.count}</span>
                  <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-slate-500">{i > 0 ? pct(conv) : ""}</span>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </section>

      {/* Demo tracker */}
      <section>
        <SectionHeader title="Demo tracker" subtitle="Advance demos → close with MRR (updates the lead + residual)" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Booked" value={num(p.demos.booked)} tone="brand" />
          <Stat label="Showed" value={num(p.demos.showed)} tone="ok" />
          <Stat label="No-show" value={num(p.demos.noShow)} tone="warn" />
          <Stat label="Closed" value={num(p.demos.closed)} tone="ok" />
        </div>
        <Card className="mt-3">
          <CardBody className="p-0">
            <DemoTracker demos={demoRows} />
          </CardBody>
        </Card>
      </section>

      {/* CIQ feedback loop — is the outcome signal actually coming back? */}
      <section>
        <SectionHeader title="CIQ feedback loop" subtitle="Demos handed to ConversionIQ's pipeline and whether their outcome has returned (via webhook + the 6-hourly reconcile)" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Handed to CIQ" value={num(loop.handed)} tone="brand" />
          <Stat label="Awaiting outcome" value={num(loop.awaiting)} tone={loop.awaiting > 0 ? "warn" : "default"} />
          <Stat label="Won / Lost" value={`${loop.won} / ${loop.lost}`} tone="ok" />
          <Stat label="Win rate" value={loop.resolved ? pct(loop.winRate) : "—"} sub={`${loop.resolved} resolved`} />
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Which verticals, personas and domains convert — and why demos are lost — lives in <Link href="/analysis" className="font-medium text-brand-400 hover:text-brand-300">Analysis →</Link>
      </p>

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

      {/* Forward projection — operator-set assumptions, never inferred from CIQ */}
      <section>
        <SectionHeader title="Forward projection" subtitle="Your assumptions — set these; never inferred from CIQ. The residual above is from real closed deals." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Assumed close rate" value={pct(proj.assumedCloseRate)} />
          <Stat label="Assumed MRR / close" value={usd(proj.assumedMonthlyMrr)} />
          <Stat label="New MRR / mo" value={usd(proj.newMrrPerMonth)} sub={`${num(proj.monthlyCloses)} closes/mo @ ${proj.demosPerDay}/day`} tone="brand" />
          <Stat label="Residual added / mo" value={usd(proj.grossResidualAddedMonthly)} sub={`${usd(proj.personalResidualAddedMonthly)}/mo your share`} tone="ok" />
        </div>
      </section>
    </div>
  );
}
