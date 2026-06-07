import { Card, CardBody, SectionHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { LabeledBar } from "@/components/ui/charts";
import { CostManager, type CostView } from "@/components/costs/cost-manager";
import { AiSpendMeter } from "@/components/costs/ai-spend-meter";
import { costSummary } from "@/lib/data/queries";
import { PageHeader } from "@/components/ui/card";
import { ensureData, getCosts } from "@/lib/data/store";
import { aiSpendSummary } from "@/lib/ai/usage";
import { appConfig } from "@/lib/config";
import { usd, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CostsPage() {
  await ensureData();
  const s = costSummary();
  const aiSpend = await aiSpendSummary();
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

      {/* Top line */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Monthly costs" value={usd(s.monthly)} sub={`${s.activeCount} line items`} tone="warn" />
        <Stat label="Annual run-rate" value={usd(s.annual)} />
        <Stat label="One-time / setup" value={usd(s.oneTime)} sub="sunk" />
        <Stat label="Net / mo" value={usd(s.netMonthly)} sub="residual − costs" tone={s.netMonthly >= 0 ? "ok" : "bad"} />
        <Stat label="Your net / mo" value={usd(s.netPerPartnerMonthly)} sub="1 of 3" tone={s.netPerPartnerMonthly >= 0 ? "ok" : "bad"} />
      </div>

      {/* Live Claude API spend meter */}
      <AiSpendMeter initial={aiSpend} softBudget={appConfig.ai.softMonthlyBudgetUsd} />

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
        Tip: Instantly, Apollo, and domain costs can later be pulled in automatically; for now add and edit them here. Apollo <em>credit</em> usage is tracked separately under Credit Guard.
      </p>
    </div>
  );
}
