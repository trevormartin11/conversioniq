import { Card, CardBody, PageHeader, SectionHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Tag } from "@/components/ui/badge";
import { SuppressionTools } from "@/components/leads/suppression-tools";
import { ensureData, getLeads, getSuppression } from "@/lib/data/store";
import { num, titleCase } from "@/lib/format";
import type { SuppressionReason } from "@/lib/data/types";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string; check?: string }> }) {
  await ensureData();
  const { q, check } = await searchParams;
  const query = (q ?? "").toLowerCase().trim();
  const leads = getLeads();
  const suppression = getSuppression();

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
      <PageHeader title="Leads & Suppression" subtitle="Master lead table (from Zoho) + the global suppression universe, enforced at load time." />

      {/* Universe stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Leads" value={num(leads.length)} />
        <Stat label="Suppressed" value={num(suppression.length)} tone="warn" />
        <Stat label="On DNC" value={num((byReason.dnc ?? 0) + (byReason.unsubscribed ?? 0))} tone="bad" />
        <Stat label="Bounced" value={num(byReason.bounced ?? 0)} />
      </div>

      {/* Tools */}
      <SuppressionTools initialCheck={check} />

      {/* Lead table */}
      <section>
        <SectionHeader title="Leads" subtitle={`${num(filtered.length)} ${query ? `matching “${q}”` : "total"}`} />
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
              {filtered.slice(0, 40).map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{l.firstName} {l.lastName}</p>
                    <p className="truncate text-xs text-slate-500">{l.email} · {l.company}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-xs text-slate-500 sm:inline">{l.vertical}</span>
                    <Tag tone={l.status === "closed" ? "ok" : l.status === "lost" ? "bad" : l.status === "positive" || l.status.startsWith("demo") ? "brand" : "slate"}>
                      {titleCase(l.status)}
                    </Tag>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No leads match.</p>}
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
    </div>
  );
}
