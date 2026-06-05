import { Card, CardBody, PageHeader, SectionHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { PhaseBanner } from "@/components/ui/phase-banner";
import { Tag } from "@/components/ui/badge";
import { attribution, lostReasons, sourcingRecommendations, pipeline, residual } from "@/lib/data/queries";
import { ensureData, getDemos, getLead } from "@/lib/data/store";
import { DemoTracker, type DemoRow } from "@/components/pipeline/demo-tracker";
import { AttributionView } from "@/components/pipeline/attribution-view";
import { DEMO_LOST_REASON_LABELS } from "@/lib/data/types";
import { num, pct, titleCase, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  await ensureData();
  const p = pipeline();
  const r = residual();
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
  const attr = {
    vertical: attribution("vertical"),
    persona: attribution("persona"),
    source: attribution("source"),
    sendingDomain: attribution("sendingDomain"),
  };
  const lost = lostReasons();
  const recs = sourcingRecommendations();

  return (
    <div className="space-y-6">
      <PageHeader title="Pipeline & Residual" subtitle="Funnel from contacted → closed, the demo tracker, and your 20%-split-3-ways residual." />

      <PhaseBanner phase={3}>
        The weekly auto-report and two-way Zoho demo-state sync land here next.
      </PhaseBanner>

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

      {/* Attribution — which cell converts (from the at-source tags) */}
      <section>
        <SectionHeader title="Attribution" subtitle="Which vertical / persona / source / sending domain converts to MRR — from the tags set at source" />
        <AttributionView data={attr} />
        {lost.length > 0 && (
          <Card className="mt-3">
            <CardBody>
              <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">Why demos are lost — the training signal back from each demo</p>
              <div className="space-y-1.5">
                {lost.map((l) => (
                  <div key={l.reason} className="flex items-center gap-2.5 text-sm">
                    <span className="w-32 shrink-0 text-slate-300">{DEMO_LOST_REASON_LABELS[l.reason]}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded bg-white/5">
                      <div className="h-full rounded bg-rose-500/60" style={{ width: `${Math.max(4, (l.count / lost[0].count) * 100)}%` }} />
                    </div>
                    <span className="w-6 text-right font-mono tabular-nums text-slate-400">{l.count}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}
        {recs.length > 0 && (
          <Card className="mt-3">
            <CardBody>
              <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">Recommended sourcing moves — feed budget into what closes</p>
              <div className="space-y-2">
                {recs.map((r) => (
                  <div key={r.vertical} className="flex items-start gap-2.5 text-sm">
                    <Tag tone={r.action === "scale" ? "ok" : r.action === "cut" ? "bad" : "warn"}>{r.action}</Tag>
                    <div className="min-w-0">
                      <span className="font-medium text-slate-200">{r.vertical}</span>
                      <span className="ml-1.5 text-xs text-slate-500">{r.reason}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}
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
