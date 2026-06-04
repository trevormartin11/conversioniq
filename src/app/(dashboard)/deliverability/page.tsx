import { Card, CardBody, SectionHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { HealthBadge, Tag } from "@/components/ui/badge";
import { Progress } from "@/components/ui/charts";
import { deliverabilitySummary } from "@/lib/data/queries";
import { ensureData, getDomains, getInboxes, getPersonas } from "@/lib/data/store";
import { appConfig } from "@/lib/config";
import { num, pct, titleCase } from "@/lib/format";
import type { Health } from "@/lib/data/types";

export const dynamic = "force-dynamic";

export default async function DeliverabilityPage() {
  await ensureData();
  const s = deliverabilitySummary();
  const domains = getDomains();
  const inboxes = getInboxes();
  const personas = getPersonas();
  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? "—";

  const rollup = domains.map((d) => {
    const ibs = inboxes.filter((i) => i.domainId === d.id);
    const paused = ibs.filter((i) => i.status === "paused").length;
    const warming = ibs.filter((i) => i.status === "warming").length;
    const avgWarmup = Math.round(ibs.reduce((a, i) => a + i.warmupScore, 0) / (ibs.length || 1));
    const health: Health = paused > 0 || !d.dmarc ? "red" : warming > ibs.length / 2 ? "yellow" : "green";
    return { d, ibs, paused, warming, avgWarmup, health };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Deliverability & Inbox Health</h1>
        <p className="text-sm text-slate-500">Existential with ~{inboxes.length} inboxes. Auto-pause on threshold breach; warmup gate at {appConfig.deliverability.warmupGate}.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Inboxes" value={num(s.total)} />
        <Stat label="Active" value={num(s.active)} tone="ok" />
        <Stat label="Warming" value={num(s.warming)} tone="warn" />
        <Stat label="Paused" value={num(s.paused)} tone={s.paused ? "bad" : "default"} />
        <Stat label="At risk" value={num(s.atRisk)} tone={s.atRisk ? "bad" : "default"} />
        <Stat label="Avg warmup" value={s.avgWarmup} />
      </div>

      <Card>
        <CardBody>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Daily capacity used</span>
            <span className="tabular-nums text-slate-200">{num(s.sentToday)} / {num(s.capacity)}</span>
          </div>
          <div className="mt-2"><Progress value={s.capacity ? s.sentToday / s.capacity : 0} tone="brand" /></div>
          <p className="mt-2 text-xs text-slate-500">{s.belowGate} inbox(es) below the warmup gate are blocked from sending.</p>
        </CardBody>
      </Card>

      {/* Domain rollup */}
      <section>
        <SectionHeader title="Domains" subtitle="SPF / DKIM / DMARC + warmup rollup" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rollup.map(({ d, ibs, warming, paused, avgWarmup, health }) => (
            <Card key={d.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{d.domain}</p>
                    <p className="text-xs text-slate-500">{personaName(d.personaId)} · {ibs.length} inboxes</p>
                  </div>
                  <HealthBadge health={health} />
                </div>
                <div className="mt-3 flex gap-1.5">
                  <Tag tone={d.spf ? "ok" : "bad"}>SPF</Tag>
                  <Tag tone={d.dkim ? "ok" : "bad"}>DKIM</Tag>
                  <Tag tone={d.dmarc ? "ok" : "bad"}>DMARC</Tag>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Avg warmup <span className="text-slate-200">{avgWarmup}</span></span>
                  <span>{warming} warming · {paused} paused</span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {/* At-risk / paused inboxes */}
      <section>
        <SectionHeader title="Inboxes needing attention" subtitle="Paused, at-risk, or below the warmup gate" />
        <Card>
          <CardBody className="p-0">
            <div className="divide-y divide-ink-800">
              {inboxes
                .filter((i) => i.status === "paused" || i.bounceRate > appConfig.deliverability.autoPauseBounceRate || i.warmupScore < appConfig.deliverability.warmupGate)
                .slice(0, 25)
                .map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">{i.email}</p>
                      <p className="text-xs text-slate-500">warmup {i.warmupScore} · {i.sentToday}/{i.dailyCap} sent · bounce {pct(i.bounceRate, 1)}</p>
                    </div>
                    <Tag tone={i.status === "paused" ? "bad" : i.status === "warming" ? "warn" : "slate"}>{titleCase(i.status)}</Tag>
                  </div>
                ))}
            </div>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
