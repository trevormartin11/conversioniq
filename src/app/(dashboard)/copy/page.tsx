import { Suspense } from "react";
import Link from "next/link";
import { GraduationCap, Lightbulb, Trophy } from "lucide-react";
import { Card, CardBody, PageHeader, SectionHeader } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { PhaseBanner } from "@/components/ui/phase-banner";
import { ensureData, getCampaigns, getInboxes, getReplies, getVariants } from "@/lib/data/store";
import { suggestCopy } from "@/lib/ai/copy";
import { deriveLearnings } from "@/lib/ai/learnings";
import { nextMoves, type NextMove } from "@/lib/ai/iterate";
import { StrategyStudio } from "@/components/copy/strategy-studio";
import { integrations } from "@/lib/config";
import { cn } from "@/lib/utils";
import { num, pct, rate } from "@/lib/format";
import type { SequenceVariant } from "@/lib/data/types";

export const dynamic = "force-dynamic";

export default async function CopyPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  await ensureData();
  const { campaign } = await searchParams;
  const variants = getVariants();
  const campaigns = getCampaigns();
  const learnings = deriveLearnings(variants, getReplies().map((r) => r.classification));
  const inboxOpts = getInboxes()
    .map((i) => ({ email: i.email, warmup: i.warmupScore, status: i.status as string }))
    .sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || b.warmup - a.warmup);

  const withCopy = campaigns.filter((c) => variants.some((v) => v.campaignId === c.id));
  const selectedId = (campaign && withCopy.some((c) => c.id === campaign) ? campaign : withCopy[0]?.id) ?? "";
  const selected = campaigns.find((c) => c.id === selectedId);
  const list = variants.filter((v) => v.campaignId === selectedId).sort((a, b) => a.step - b.step || a.variant.localeCompare(b.variant));
  const bestInStep = (step: number) =>
    [...list.filter((v) => v.step === step)].sort((a, b) => rate(b.positives, b.sent) - rate(a.positives, a.sent))[0]?.id;
  const steps = new Set(list.map((v) => v.step)).size;

  return (
    <div className="space-y-6">
      <PageHeader title="Copy Coach" subtitle={`AI reads your real results and suggests what to test next. ${integrations.anthropic ? "Powered by Claude." : "Rules-based until a Claude key is added."}`} />

      <PhaseBanner phase={2}>
        Approving outgoing copy, launching A/B variants, and pushing winners back to Instantly are wired here next. Pick a campaign to analyze its sequence.
      </PhaseBanner>

      <section>
        <SectionHeader title="Learnings" subtitle="Cross-campaign memory applied to new copy — seeded by your playbook, sharpened by real results" />
        <div className="grid gap-2 sm:grid-cols-2">
          {learnings.map((l, i) => (
            <Card key={i}>
              <CardBody className="flex gap-3">
                <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{l.theme}</p>
                    <Tag tone={l.tone === "win" ? "ok" : l.tone === "watch" ? "warn" : "slate"}>{l.tone === "seed" ? "playbook" : l.tone}</Tag>
                  </div>
                  <p className="mt-1 text-sm text-slate-200">{l.insight}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{l.evidence}</p>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="Recommended next moves" subtitle="What to do about the results — scale winners, kill losers, test what's next" />
        <Suspense fallback={<SuggestionsSkeleton />}>
          <NextMoves />
        </Suspense>
      </section>

      <section>
        <SectionHeader title="New campaign studio" subtitle="AI picks the vertical (and why), then drafts copy grounded in it — sharpened by the learnings above" />
        <StrategyStudio aiOn={integrations.anthropic} inboxes={inboxOpts} />
      </section>

      {withCopy.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {withCopy.map((c) => (
            <Link
              key={c.id}
              href={`/copy?campaign=${c.id}`}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                c.id === selectedId ? "bg-brand-600 text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700",
              )}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      <section>
        <SectionHeader title={selected?.name ?? "Sequence"} subtitle={`${list.length} variant${list.length === 1 ? "" : "s"} · ${steps} step${steps === 1 ? "" : "s"}`} />
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((v) => {
            const inStep = list.filter((x) => x.step === v.step).length;
            const isBest = inStep > 1 && v.id === bestInStep(v.step);
            return (
              <Card key={v.id} className={isBest ? "border-ok/40" : undefined}>
                <CardBody>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-100">Step {v.step} · Variant {v.variant}</span>
                    {isBest && <span className="chip bg-ok/15 text-emerald-300 ring-1 ring-inset ring-ok/25"><Trophy className="h-3 w-3" /> Winning</span>}
                  </div>
                  <p className="mt-2 text-xs font-medium text-slate-300">“{v.subject}”</p>
                  <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-slate-500">{v.body}</p>
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

      <section>
        <SectionHeader title="Suggestions" subtitle="Data-driven, in the ConversionIQ voice" />
        <Suspense fallback={<SuggestionsSkeleton />}>
          <AiSuggestions variants={list} />
        </Suspense>
      </section>
    </div>
  );
}

/** Streamed so the page never blocks on the model. */
async function AiSuggestions({ variants }: { variants: SequenceVariant[] }) {
  const suggestions = variants.length ? await suggestCopy(variants) : [];
  if (!suggestions.length) return <p className="text-sm text-slate-500">No variants to analyze yet.</p>;
  return (
    <div className="space-y-2">
      {suggestions.map((s, i) => (
        <Card key={i}>
          <CardBody className="flex gap-3">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-100">{s.title}</p>
              <p className="mt-0.5 text-xs text-slate-400">{s.detail}</p>
            </div>
            <Tag tone={s.source === "ai" ? "brand" : "slate"}>{s.source}</Tag>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function moveTone(kind: NextMove["kind"]): "ok" | "bad" | "brand" | "warn" | "slate" {
  return kind === "scale" ? "ok" : kind === "kill" ? "bad" : kind === "test" ? "brand" : kind === "fix" ? "warn" : "slate";
}

async function NextMoves() {
  const moves = await nextMoves(getCampaigns(), getVariants(), getReplies());
  return (
    <div className="space-y-2">
      {moves.map((m, i) => (
        <Card key={i}>
          <CardBody className="flex items-start gap-3">
            <Tag tone={moveTone(m.kind)}>{m.kind}</Tag>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-100">{m.title}</p>
              <p className="mt-0.5 text-xs text-slate-400">{m.detail}</p>
            </div>
            {m.source === "ai" && <Tag tone="brand">ai</Tag>}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function SuggestionsSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-ink-900/60" />
      ))}
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
