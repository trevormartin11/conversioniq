import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, Lightbulb } from "lucide-react";
import { Card, CardBody, PageHeader, SectionHeader } from "@/components/ui/card";
import { HealthBadge, Tag } from "@/components/ui/badge";
import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { EditableVariant } from "@/components/campaigns/editable-variant";
import { campaignCards, campaignCapacity } from "@/lib/data/queries";
import { suggestCopy } from "@/lib/ai/copy";
import { ensureData, getCampaign, getInboxes, getPersonas, getVariants } from "@/lib/data/store";
import { campaignHasLeads, getInstantlyCampaign, type InstantlyCampaignView, type InstantlyStepView } from "@/lib/integrations/instantly";
import { integrations } from "@/lib/config";
import { num, pct, rate, titleCase } from "@/lib/format";
import type { SequenceVariant } from "@/lib/data/types";

export const dynamic = "force-dynamic";

function stepsFromSynced(vs: SequenceVariant[]): InstantlyStepView[] {
  const map = new Map<number, InstantlyStepView>();
  for (const v of [...vs].sort((a, b) => a.step - b.step || a.variant.localeCompare(b.variant))) {
    if (!map.has(v.step)) map.set(v.step, { step: v.step, delay: 0, cumulativeDay: 0, variants: [] });
    map.get(v.step)!.variants.push({ variant: v.variant, subject: v.subject, body: v.body });
  }
  return [...map.values()];
}

export default async function CampaignDetail({ params }: { params: Promise<{ id: string }> }) {
  await ensureData();
  const { id } = await params;
  const c = getCampaign(id);
  if (!c) notFound();

  const persona = getPersonas().find((p) => p.id === c.personaId);
  const inboxes = getInboxes().filter((i) => c.inboxIds.includes(i.id));
  const synced = getVariants().filter((v) => v.campaignId === id);
  const card = campaignCards().find((x) => x.id === id);
  const cap = campaignCapacity(id);

  // Best-effort live fetch: gives true cadence + full copy + sending-inbox count.
  let live: InstantlyCampaignView | null = null;
  let hasLeads: boolean | null = null;
  if (c.instantlyCampaignId && integrations.instantly) {
    try { live = await getInstantlyCampaign(c.instantlyCampaignId); } catch { /* fall back to synced */ }
    try { hasLeads = await campaignHasLeads(c.instantlyCampaignId); } catch { /* unknown */ }
  }

  const hasCadence = !!live;
  const steps = live?.steps ?? stepsFromSynced(synced);
  const statFor = (step: number, variant: string) => synced.find((v) => v.step === step && v.variant === variant);

  return (
    <div className="space-y-5">
      <Link href="/campaigns" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
        <ArrowLeft className="h-3.5 w-3.5" /> All campaigns
      </Link>

      <PageHeader
        title={c.name}
        subtitle={`${c.vertical} · ${persona?.name ?? "—"}`}
        action={<div className="flex items-center gap-2"><Tag tone={c.status === "active" ? "ok" : c.status === "draft" ? "warn" : "slate"}>{titleCase(c.status)}</Tag>{card && <HealthBadge health={card.health} />}</div>}
      />

      {/* Control bar */}
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-300">
            {c.status === "draft" || c.status === "paused"
              ? "Pre-staged and ready. Launch starts sending on the cadence below."
              : "Live — sending on the cadence below."}
          </div>
          <CampaignActions id={c.id} status={c.status} />
        </CardBody>
      </Card>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Meta label="Daily cap" value={`${num(live?.dailyLimit || c.dailyCap)}/day`} />
        <Meta label="Sending inboxes" value={live ? num(live.inboxCount) : "—"} />
        <Meta label="Sequence" value={`${steps.length} step${steps.length === 1 ? "" : "s"}`} />
        <Meta label="Leads" value={hasLeads === null ? "—" : hasLeads ? "Loaded" : "None yet"} />
      </div>

      {/* Capacity & throughput — how much this campaign can send + how to scale it */}
      {cap && (
        <section>
          <SectionHeader title="Capacity & throughput" subtitle="What this campaign can actually send — and the levers to scale it" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Meta label="Daily capacity" value={`${num(cap.dailyCapacity)}/day`} />
            <Meta label="If warming finishes" value={`${num(cap.potentialDaily)}/day`} />
            <Meta label="Leads loaded" value={num(cap.leadsLoaded)} />
            <Meta label="Days to first-touch" value={cap.daysToFirstTouch === null ? "—" : `${cap.daysToFirstTouch}d`} />
          </div>
          <Card className="mt-3">
            <CardBody className="space-y-1.5 text-sm text-slate-400">
              <p>
                <span className="text-slate-200">{cap.warmed} warmed inbox{cap.warmed === 1 ? "" : "es"}</span> sending ~{cap.perInboxCap}/day each
                {cap.warming > 0 ? `, ${cap.warming} still warming` : ""}{cap.paused > 0 ? `, ${cap.paused} paused` : ""}.
                {cap.warming > 0 && ` Warming those up lifts you to ~${cap.potentialDaily}/day (≈2–4 weeks).`}
              </p>
              {cap.capBound && (
                <p className="text-warn">Your inboxes can send more, but the campaign daily cap ({cap.campaignCap}/day) is the limiter — raise it to use the headroom.</p>
              )}
              <p>
                Each new domain/inbox you provision adds ~{cap.perInboxCap}/day after warmup.{" "}
                <span className="text-slate-500">More leads = more runway, not more speed: to go faster add warmed inboxes; to extend runway load more leads.</span>
              </p>
              {cap.awaitingFirstTouch === 0 && cap.leadsLoaded > 0 && (
                <p className="text-slate-500">All loaded leads have been first-touched — load more to keep this cell fed.</p>
              )}
            </CardBody>
          </Card>
        </section>
      )}

      {/* Assigned inboxes — per-campaign deliverability + attribution */}
      {inboxes.length > 0 && (
        <section>
          <SectionHeader title="Assigned inboxes" subtitle={`${inboxes.length} sending from this campaign · tracked for deliverability + attribution`} />
          <div className="grid gap-2 sm:grid-cols-2">
            {inboxes.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-200">{i.email}</p>
                  <p className="text-[11px] text-slate-500">warmup {i.warmupScore}</p>
                </div>
                <Tag tone={i.status === "active" ? "ok" : i.status === "warming" ? "warn" : "slate"}>{i.status}</Tag>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sequence + cadence */}
      <section>
        <SectionHeader
          title="Sequence"
          subtitle={hasCadence ? "Edit copy inline · cadence live from Instantly" : "Edit copy inline · cadence shows once synced"}
        />
        <div className="space-y-3">
          {steps.map((s) => (
            <Card key={s.step}>
              <CardBody>
                <div className="flex items-center gap-2">
                  <span className="flex h-6 items-center rounded-md bg-brand-600/15 px-2 text-xs font-semibold text-brand-300 ring-1 ring-inset ring-brand-500/25">
                    {hasCadence ? `Day ${s.cumulativeDay}` : `Step ${s.step}`}
                  </span>
                  {hasCadence && s.delay > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Clock className="h-3 w-3" /> waits {s.delay} day{s.delay === 1 ? "" : "s"}</span>
                  )}
                </div>
                <div className="mt-3 space-y-4">
                  {s.variants.map((v) => {
                    const stat = statFor(s.step, v.variant);
                    return (
                      <div key={v.variant} className="border-l-2 border-ink-700 pl-3">
                        {s.variants.length > 1 && <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Variant {v.variant}</p>}
                        {stat ? (
                          <EditableVariant id={stat.id} subject={stat.subject} body={stat.body} aiOn={integrations.anthropic} />
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-slate-100">{v.subject || <span className="text-slate-600">(no subject)</span>}</p>
                            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-400">{v.body || "(empty)"}</p>
                          </>
                        )}
                        {stat && stat.sent > 0 && (
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                            <span>{num(stat.sent)} sent</span>
                            <span>{pct(rate(stat.opens, stat.sent))} open</span>
                            <span>{pct(rate(stat.replies, stat.sent), 1)} reply</span>
                            <span className="text-emerald-400">{pct(rate(stat.positives, stat.sent), 1)} positive</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          ))}
          {steps.length === 0 && (
            <Card><CardBody className="text-sm text-slate-500">No sequence synced yet. Run a sync, or open this campaign in Instantly.</CardBody></Card>
          )}
        </div>
      </section>

      {/* AI Coach — recommendations from this campaign's open & positive-reply rates */}
      <section>
        <SectionHeader title="AI Coach" subtitle="Subject + first-line suggestions driven by this campaign's open & positive-reply rates" />
        <Suspense fallback={<Card><CardBody className="text-sm text-slate-500">Analyzing this campaign&apos;s copy…</CardBody></Card>}>
          <AiCoach variants={synced} />
        </Suspense>
      </section>

      <p className="flex items-center gap-1.5 text-xs text-slate-600">
        <CheckCircle2 className="h-3.5 w-3.5" /> Edits save to the hub copy; merge tags like {"{{firstName}}"} fill per-lead at send time. Live campaigns also need a push to Instantly to change what&apos;s sending.
      </p>
    </div>
  );
}

async function AiCoach({ variants }: { variants: SequenceVariant[] }) {
  const suggestions = variants.length ? await suggestCopy(variants) : [];
  if (!suggestions.length) {
    return <Card><CardBody className="text-sm text-slate-500">Suggestions appear once this campaign has sent emails.</CardBody></Card>;
  }
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
      <div className="text-sm font-semibold text-slate-100">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
