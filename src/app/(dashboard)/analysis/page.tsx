import { Suspense } from "react";
import Link from "next/link";
import { Card, CardBody, PageHeader, SectionHeader } from "@/components/ui/card";
import { Tag, HealthBadge } from "@/components/ui/badge";
import { ensureData, getCampaigns, getReplies, getVariants } from "@/lib/data/store";
import { nextMoves, type NextMove } from "@/lib/ai/iterate";
import { attribution, campaignCards, lostReasons, sourcingRecommendations } from "@/lib/data/queries";
import { AttributionView } from "@/components/pipeline/attribution-view";
import { DEMO_LOST_REASON_LABELS } from "@/lib/data/types";
import { integrations } from "@/lib/config";
import { num, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

function moveTone(kind: NextMove["kind"]): "ok" | "bad" | "brand" | "warn" | "slate" {
  return kind === "scale" ? "ok" : kind === "kill" ? "bad" : kind === "test" ? "brand" : kind === "fix" ? "warn" : "slate";
}

export default async function AnalysisPage() {
  await ensureData();
  const cards = campaignCards();
  const lost = lostReasons();
  const maxLost = lost[0]?.count ?? 1;
  const attr = {
    vertical: attribution("vertical"),
    persona: attribution("persona"),
    source: attribution("source"),
    sendingDomain: attribution("sendingDomain"),
  };
  const recs = sourcingRecommendations();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analysis"
        subtitle={`Step 5 — what the data says to tweak next. ${integrations.anthropic ? "AI-driven." : "Rules-based until a Claude key is added."}`}
      />

      <section>
        <SectionHeader title="Recommended next moves" subtitle="Scale winners, kill losers, fix leaks — act on each in Copy & Sequence or the campaign." />
        <Suspense fallback={<MovesSkeleton />}>
          <Moves />
        </Suspense>
      </section>

      <section>
        <SectionHeader title="Per-campaign read" subtitle="Health + where to act." />
        {cards.length === 0 ? (
          <p className="text-sm text-slate-500">No campaigns yet — launch one and results land here.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {cards.map((c) => (
              <Card key={c.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.vertical}</p>
                    </div>
                    <HealthBadge health={c.health} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <Mini label="Sent" value={num(c.sent)} />
                    <Mini label="Reply" value={pct(c.replyRate, 1)} />
                    <Mini label="Positive" value={pct(c.positiveRate, 1)} />
                  </div>
                  <div className="mt-3 flex gap-3 text-xs">
                    <Link href={`/campaigns/${c.id}`} className="font-medium text-brand-400 hover:text-brand-300">Tune copy →</Link>
                    <Link href={`/campaigns/${c.id}`} className="font-medium text-slate-400 hover:text-slate-200">Open campaign →</Link>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Attribution — which cell converts (from the at-source tags) */}
      <section>
        <SectionHeader title="Attribution" subtitle="Which vertical / persona / source / sending domain converts to MRR — from the tags set at source." />
        <AttributionView data={attr} />
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

      {lost.length > 0 && (
        <section>
          <SectionHeader title="Why demos are lost" subtitle="The signal back from each completed demo — feed it into targeting + copy." />
          <Card>
            <CardBody className="space-y-1.5">
              {lost.map((l) => (
                <div key={l.reason} className="flex items-center gap-2.5 text-sm">
                  <span className="w-32 shrink-0 text-slate-300">{DEMO_LOST_REASON_LABELS[l.reason]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-white/5">
                    <div className="h-full rounded bg-rose-500/60" style={{ width: `${Math.max(4, (l.count / maxLost) * 100)}%` }} />
                  </div>
                  <span className="w-6 text-right font-mono tabular-nums text-slate-400">{l.count}</span>
                </div>
              ))}
            </CardBody>
          </Card>
        </section>
      )}

      <p className="text-xs text-slate-500">
        Cross-campaign learnings live in <Link href="/strategy" className="font-medium text-brand-400 hover:text-brand-300">Strategy →</Link>
      </p>
    </div>
  );
}

/** Streamed so the page never blocks on the model. */
async function Moves() {
  const moves = await nextMoves(getCampaigns(), getVariants(), getReplies());
  if (!moves.length) return <p className="text-sm text-slate-500">Not enough data yet — send a bit and the moves appear here.</p>;
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

function MovesSkeleton() {
  return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-ink-900/60" />)}</div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-2">
      <div className="font-mono text-sm font-semibold tabular-nums text-slate-100">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
