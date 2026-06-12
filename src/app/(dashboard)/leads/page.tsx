import { Card, CardBody, PageHeader, SectionHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Tag } from "@/components/ui/badge";
import { SuppressionTools } from "@/components/leads/suppression-tools";
import { AddLeadsToCampaign } from "@/components/leads/add-leads-to-campaign";
import { Progress } from "@/components/ui/charts";
import { Lock } from "lucide-react";
import { ensureData, getCampaigns, getLeads, getSuppression } from "@/lib/data/store";
import { creditSummary } from "@/lib/data/queries";
import { appConfig } from "@/lib/config";
import { ago, num, pct, titleCase } from "@/lib/format";
import { leadTimezone } from "@/lib/send-timing";
import type { SuppressionReason } from "@/lib/data/types";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string; check?: string }> }) {
  await ensureData();
  const { q, check } = await searchParams;
  const query = (q ?? "").toLowerCase().trim();
  const leads = getLeads();
  const suppression = getSuppression();
  const meters = creditSummary();
  const demosPerMonth = appConfig.goals.demosPerDay * 30;
  const maxCostPerDemo = appConfig.goals.monthlyBudgetUsd / demosPerMonth;
  const maxCostPerLead = maxCostPerDemo * 0.01;
  const campaignOptions = getCampaigns().map((c) => ({ id: c.id, name: c.name, status: c.status, hasInstantly: !!c.instantlyCampaignId, vertical: c.vertical }));

  const byReason = {} as Record<SuppressionReason, number>;
  for (const s of suppression) byReason[s.reason] = (byReason[s.reason] ?? 0) + 1;

  const filtered = query
    ? leads.filter(
        (l) =>
          l.email.toLowerCase().includes(query) ||
          l.company.toLowerCase().includes(query) ||
          `${l.firstName} ${l.lastName}`.toLowerCase().includes(query),
      )
    : leads;

  return (
    <div className="space-y-6">
      <PageHeader title="Leads & Sourcing" subtitle="Find, identify, and load leads into your campaigns — over the global suppression universe, enforced at load time." />

      {/* Universe stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Leads" value={num(leads.length)} />
        <Stat label="Suppressed" value={num(suppression.length)} tone="warn" />
        <Stat label="On DNC" value={num((byReason.dnc ?? 0) + (byReason.unsubscribed ?? 0))} tone="bad" />
        <Stat label="Bounced" value={num(byReason.bounced ?? 0)} />
      </div>

      {/* THE job: load leads into a campaign — source new (auto-targeted) or paste/CSV a list */}
      <section>
        <SectionHeader title="Add leads to a campaign" subtitle="Pick a campaign, then source new leads (router picks the cheapest covering source → verify → dedupe) or paste an existing list. Both persist → Zoho → Instantly." />
        <AddLeadsToCampaign campaigns={campaignOptions} />
      </section>

      {/* Supporting: check the universe / dedupe a list before it ever enters a campaign */}
      <section>
        <SectionHeader title="Check & dedupe" subtitle="Look up a contact, or pre-screen a list against the contacted + DNC universe." />
        <SuppressionTools initialCheck={check} />
      </section>

      {/* Lead table */}
      <section>
        <SectionHeader title="Leads" subtitle={`${num(filtered.length)} ${query ? `matching “${q}”` : "total"} · timezone inferred for send timing`} />
        <form className="mb-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, email, or company…"
            className="h-10 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
          />
        </form>
        <Card>
          <CardBody className="p-0">
            <div className="divide-y divide-ink-800">
              {filtered.slice(0, 40).map((l) => {
                const tz = leadTimezone(l);
                return (
                  <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">{l.firstName} {l.lastName}</p>
                      <p className="truncate text-xs text-slate-500">{l.email} · {l.company}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {tz !== "unknown" && (
                        <span className="hidden rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400 sm:inline" title="Inferred send timezone (from area code)">{tz}</span>
                      )}
                      <span className="hidden text-xs text-slate-500 sm:inline">{l.vertical}</span>
                      <Tag tone={l.status === "closed" ? "ok" : l.status === "lost" ? "bad" : l.status === "positive" || l.status.startsWith("demo") ? "brand" : "slate"}>
                        {titleCase(l.status)}
                      </Tag>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No leads match.</p>}
              {filtered.length > 40 && (
                <p className="px-4 py-2.5 text-center text-xs text-slate-500">Showing the first 40 of {filtered.length} — search to narrow.</p>
              )}
            </div>
          </CardBody>
        </Card>
      </section>

      {/* Suppression list */}
      <section>
        <SectionHeader title="Suppression universe" subtitle="Enforced before anyone enters a campaign" />
        <Card>
          <CardBody className="p-0">
            <div className="divide-y divide-ink-800">
              {suppression.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing suppressed yet — DNC, unsubscribes, and bounces will collect here automatically.</p>
              )}
              {suppression.slice(0, 20).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="truncate text-slate-300">{s.email ?? s.domain}</span>
                  <div className="flex items-center gap-2">
                    {s.note && <span className="hidden max-w-[40ch] truncate text-xs text-slate-600 md:inline">{s.note}</span>}
                    <Tag tone={s.reason === "dnc" || s.reason === "unsubscribed" ? "bad" : s.reason === "bounced" ? "warn" : "slate"}>{titleCase(s.reason)}</Tag>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </section>

      {/* Credit visibility — what's left to spend on sourcing + enrichment */}
      <section>
        <SectionHeader title="Credits & budget" subtitle="What's left to spend on sourcing & enrichment. CIQ credits are gated — never auto-spent." />
        <div className="mb-3 grid grid-cols-3 gap-3">
          <Stat label="Max cost / demo" value={`$${maxCostPerDemo.toFixed(2)}`} />
          <Stat label="Max cost / lead" value={`~$${maxCostPerLead.toFixed(2)}`} sub="at 1% lead→demo" />
          <Stat label="Monthly budget" value={`$${num(appConfig.goals.monthlyBudgetUsd)}`} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {meters.map((m) => (
            <Card key={m.provider}>
              <CardBody>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{m.label}</p>
                  {m.gated && <span className="chip bg-bad/15 text-bad"><Lock className="h-3 w-3" /> Gated</span>}
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <span className="text-xl font-semibold tabular-nums text-slate-100">{num(m.remaining)}</span>
                  <span className="text-[11px] text-slate-500">{num(m.used)}/{num(m.total)} · {pct(m.pctUsed, 0)}</span>
                </div>
                <div className="mt-2"><Progress value={m.pctUsed} tone={m.pctUsed > 0.85 ? "bad" : m.pctUsed > 0.6 ? "warn" : "ok"} /></div>
                {m.resetsAt && <p className="mt-1 text-[10px] text-slate-500">Resets {ago(m.resetsAt)}</p>}
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
