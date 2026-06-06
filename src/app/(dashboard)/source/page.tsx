import Link from "next/link";
import { Card, CardBody, PageHeader, SectionHeader } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { ensureData, getLeads, getSuppression } from "@/lib/data/store";
import { appConfig } from "@/lib/config";
import { num, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

const PIPELINE = [
  { k: "Discover", desc: "Pull net-new businesses in the target vertical — Google Maps (Outscraper) for local, Apollo/Lusha for firmographic + corporate." },
  { k: "Enrich", desc: "Find the owner/decision-maker email (Findymail / Apollo enrich-by-id)." },
  { k: "Verify", desc: "MillionVerifier every address before it can be sent — protects deliverability." },
  { k: "Dedupe", desc: "Check the global suppression universe (contacted, DNC, unsubscribed, bounced, competitors, existing CIQ customers) at load time." },
  { k: "Load", desc: "Survivors become leads on a campaign, attributed to vertical + source." },
];

export default async function SourcePage() {
  await ensureData();
  const leads = getLeads();
  const suppression = getSuppression();

  // Cost ceiling, derived from the budget + demo goal. The lead→demo rate is a
  // placeholder assumption that tightens as real funnel data accrues.
  const demosPerMonth = appConfig.goals.demosPerDay * 30;
  const maxCostPerDemo = appConfig.goals.monthlyBudgetUsd / demosPerMonth;
  const assumedLeadToDemo = 0.01; // 1% — until live data refines it
  const maxCostPerLead = maxCostPerDemo * assumedLeadToDemo;

  const byStatus = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Source"
        subtitle="Step 2 — turn a target vertical into verified, send-ready leads."
        action={<Tag tone="brand">{num(leads.length)} leads · {num(suppression.length)} suppressed</Tag>}
      />

      <section>
        <SectionHeader title="Sourcing pipeline" subtitle="Every lead runs this gauntlet before it can be emailed." />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE.map((s, i) => (
            <Card key={s.k}>
              <CardBody className="space-y-1">
                <p className="text-xs text-slate-500">Step {i + 1}</p>
                <p className="text-sm font-medium text-slate-100">{s.k}</p>
                <p className="text-xs text-slate-400">{s.desc}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Cost ceiling"
          subtitle={`Defended against the $${appConfig.goals.monthlyBudgetUsd}/mo budget + ${appConfig.goals.demosPerDay} demos/day goal.`}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardBody>
              <p className="text-xs uppercase tracking-wide text-slate-500">Max cost / demo</p>
              <p className="mt-1 text-xl font-semibold text-slate-100">{`$${maxCostPerDemo.toFixed(2)}`}</p>
              <p className="mt-1 text-xs text-slate-500">{demosPerMonth} demos/mo at budget</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-xs uppercase tracking-wide text-slate-500">Max cost / lead</p>
              <p className="mt-1 text-xl font-semibold text-slate-100">{`~$${maxCostPerLead.toFixed(2)}`}</p>
              <p className="mt-1 text-xs text-slate-500">at an assumed 1% lead→demo (tightens with real data)</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-xs uppercase tracking-wide text-slate-500">Implied lane</p>
              <p className="mt-1 text-sm text-slate-200">
                At that ceiling, cheap high-volume sourcing (Maps→enrich→verify) leads; premium credits (Apollo/Lusha) are reserved for high-value targets.
              </p>
            </CardBody>
          </Card>
        </div>
      </section>

      <section>
        <SectionHeader title="Lead inventory" subtitle="Where the current book stands by status." />
        <div className="flex flex-wrap gap-2">
          {Object.entries(byStatus)
            .sort((a, b) => b[1] - a[1])
            .map(([status, n]) => (
              <Tag key={status} tone="slate">
                {titleCase(status)}: {n}
              </Tag>
            ))}
        </div>
      </section>

      <Link href="/copy" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300">
        Next: write the sequence &amp; cadence →
      </Link>
    </div>
  );
}
