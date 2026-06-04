import { Lightbulb, Trophy } from "lucide-react";
import { Card, CardBody, PageHeader, SectionHeader } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { PhaseBanner } from "@/components/ui/phase-banner";
import { ensureData, getCampaigns, getVariants } from "@/lib/data/store";
import { suggestCopy } from "@/lib/ai/copy";
import { integrations } from "@/lib/config";
import { num, pct, rate } from "@/lib/format";
import type { SequenceVariant } from "@/lib/data/types";

export const dynamic = "force-dynamic";

export default async function CopyPage() {
  await ensureData();
  const variants = getVariants();
  const campaigns = getCampaigns();
  const suggestions = await suggestCopy(variants);
  const nameOf = (id: string) => campaigns.find((c) => c.id === id)?.name ?? "Campaign";

  // group by campaign, then mark the best variant within each campaign+step (apples-to-apples)
  const groups = new Map<string, SequenceVariant[]>();
  for (const v of variants) {
    const g = groups.get(v.campaignId) ?? [];
    g.push(v);
    groups.set(v.campaignId, g);
  }
  const bestInStep = (list: SequenceVariant[], step: number) =>
    [...list.filter((v) => v.step === step)].sort((a, b) => rate(b.positives, b.sent) - rate(a.positives, a.sent))[0]?.id;

  return (
    <div className="space-y-6">
      <PageHeader title="Copy Coach" subtitle={`AI reads your real results and suggests what to test next. ${integrations.anthropic ? "Powered by Claude." : "Rules-based until a Claude key is added."}`} />

      <PhaseBanner phase={2}>
        Approving outgoing copy, launching A/B variants, and pushing winners back to Instantly are wired here next. Below is live analysis of your synced sequences.
      </PhaseBanner>

      {[...groups.entries()].map(([cid, list]) => {
        const steps = new Set(list.map((v) => v.step)).size;
        return (
          <section key={cid}>
            <SectionHeader title={nameOf(cid)} subtitle={`${list.length} variant${list.length > 1 ? "s" : ""} · ${steps} step${steps > 1 ? "s" : ""}`} />
            <div className="grid gap-3 sm:grid-cols-2">
              {[...list].sort((a, b) => a.step - b.step || a.variant.localeCompare(b.variant)).map((v) => {
                const inStep = list.filter((x) => x.step === v.step).length;
                const isBest = inStep > 1 && v.id === bestInStep(list, v.step);
                return (
                  <Card key={v.id} className={isBest ? "border-ok/40" : undefined}>
                    <CardBody>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-100">Step {v.step} · Variant {v.variant}</span>
                        {isBest && <span className="chip bg-ok/15 text-emerald-300 ring-1 ring-inset ring-ok/25"><Trophy className="h-3 w-3" /> Winning</span>}
                      </div>
                      <p className="mt-2 text-xs font-medium text-slate-300">“{v.subject}”</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{v.body}</p>
                      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                        <Mini label="Sent" value={num(v.sent)} />
                        <Mini label="Open" value={pct(rate(v.opens, v.sent))} />
                        <Mini label="Reply" value={pct(rate(v.replies, v.sent), 1)} />
                        <Mini label="Pos" value={pct(rate(v.positives, v.sent), 1)} />
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}

      <section>
        <SectionHeader title="Suggestions" subtitle="Data-driven, in the ConversionIQ voice" />
        <div className="space-y-2">
          {suggestions.map((s, i) => (
            <Card key={i}>
              <CardBody className="flex gap-3">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                <div>
                  <p className="text-sm font-medium text-slate-100">{s.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{s.detail}</p>
                </div>
                <Tag tone={s.source === "ai" ? "brand" : "slate"}>{s.source}</Tag>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-2">
      <div className="font-mono text-sm font-semibold tabular-nums text-slate-100">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
