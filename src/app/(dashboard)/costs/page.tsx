import { Card, CardBody, SectionHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { LabeledBar } from "@/components/ui/charts";
import { CostManager, type CostView } from "@/components/costs/cost-manager";
import { costSummary, costDashboard } from "@/lib/data/queries";
import { PageHeader } from "@/components/ui/card";
import { ensureData, getCosts } from "@/lib/data/store";
import { loadCostMeter } from "@/lib/ai/cost-meter";
import { usd, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CostsPage() {
  await ensureData(["costs", "demos", "leads", "metrics"]);
  const s = costSummary();
  const meter = await loadCostMeter();
  const claudeMonthly = meter.actual ? meter.actual.monthToDateUsd : meter.self.monthToDateUsd;
  const d = costDashboard({ monthlyUsd: claudeMonthly, byDay: meter.actual?.byDayUsd });
  const cplArrow = d.costPerLeadTrend === "down" ? "▼" : d.costPerLeadTrend === "up" ? "▲" : "→";
  const cplSub = d.costPerLead == null ? "no leads sourced yet" : `${cplArrow} vs prior 30d · ${d.leadsSourced30d} leads`;
  const claudeSub = meter.actual
    ? meter.actual.scoped
      ? "billed · scoped to this app"
      : "billed · org-wide — set ANTHROPIC_WORKSPACE_ID"
    : "estimate · add admin key for actual";
  const costs: CostView[] = getCosts().map((c) => ({
    id: c.id,
    category: c.category,
    vendor: c.vendor,
    description: c.description,
    amount: c.amount,
    cadence: c.cadence,
    note: c.note,
  }));
  const catEntries = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...catEntries.map(([, v]) => v));

  return (
    <div className="space-y-6">
      <PageHeader title="Costs & P&L" subtitle="Every cost of running the operation — sending, data, email, domains, leads — against your residual, for true net." />

      {/* Top line — the five headline KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Variable cost / lead" value={d.costPerLead == null ? "—" : usd(d.costPerLead)} sub={cplSub} tone={d.costPerLeadTrend === "down" ? "ok" : d.costPerLeadTrend === "up" ? "bad" : undefined} />
        <Stat label="Fixed costs / mo" value={usd(d.fixedMonthly)} sub="recurring overhead" />
        <Stat label="Variable costs / mo" value={usd(d.variableMonthly)} sub="scales w/ volume + Claude" tone="warn" />
        <Stat label="Total spend / mo" value={usd(d.totalMonthly)} sub="rolling 30-day" tone="warn" />
        <Stat label="Revenue / mo" value={usd(d.revenueMonthly)} sub={`net ${usd(d.netRevenueMonthly)}/mo`} tone={d.netRevenueMonthly >= 0 ? "ok" : "bad"} />
      </div>

      {/* Single Claude API spend box */}
      <Card>
        <CardBody className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-400">Claude API · month to date</p>
            <p className="mt-0.5 text-2xl font-semibold text-slate-100">{usd(claudeMonthly)}</p>
          </div>
          <span className="max-w-[14rem] text-right text-[11px] text-slate-500">{claudeSub}</span>
        </CardBody>
      </Card>

      {/* Net explainer */}
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-slate-400">Gross residual <span className="font-semibold text-brand-400">{usd(s.grossResidualMonthly)}/mo</span> − costs <span className="font-semibold text-warn">{usd(s.monthly)}/mo</span></span>
          <span className={s.breakeven ? "font-semibold text-ok" : "font-semibold text-bad"}>
            {s.breakeven ? "Above break-even" : "Below break-even"} · net {usd(s.netMonthly)}/mo
          </span>
        </CardBody>
      </Card>

      {/* By category */}
      <section>
        <SectionHeader title="Monthly cost by category" subtitle="Annual costs amortized to monthly; one-time excluded" />
        <Card>
          <CardBody className="space-y-2">
            {catEntries.length === 0 && <p className="text-sm text-slate-500">No active costs.</p>}
            {catEntries.map(([cat, val]) => (
              <LabeledBar key={cat} label={titleCase(cat)} value={Math.round(val)} max={maxCat} tone="warn" />
            ))}
          </CardBody>
        </Card>
      </section>

      {/* Line items + add */}
      <CostManager costs={costs} />

      <p className="text-xs text-slate-600">
        Tip: Instantly, Apollo, and domain costs can later be pulled in automatically; for now add and edit them here. Provider <em>credit</em> meters live on Leads → Credits &amp; budget.
      </p>
    </div>
  );
}
