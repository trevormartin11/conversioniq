import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { HealthBadge, Tag } from "@/components/ui/badge";
import { PhaseBanner } from "@/components/ui/phase-banner";
import { NewCampaignForm } from "@/components/campaigns/new-campaign-form";
import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { campaignCards } from "@/lib/data/queries";
import { ensureData, getCampaigns, getPersonas, getVariants } from "@/lib/data/store";
import { num, pct, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  await ensureData();
  const campaigns = getCampaigns();
  const cards = campaignCards();
  const personas = getPersonas();
  const variants = getVariants();
  const cardFor = (id: string) => cards.find((c) => c.id === id);
  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? "—";
  const stepsOf = (id: string) => new Set(variants.filter((v) => v.campaignId === id).map((v) => v.step)).size;

  return (
    <div className="space-y-5">
      <PageHeader title="Campaigns" subtitle="Parallel cells by vertical." action={<NewCampaignForm personas={personas} />} />

      <PhaseBanner phase={2}>
        Launch, pause, clone, and stage campaigns are live (synced from Instantly). Inbox/persona assignment, schedule editing, and inline sequence editing are next.
      </PhaseBanner>

      <div className="space-y-3">
        {campaigns.map((c) => {
          const card = cardFor(c.id);
          return (
            <Card key={c.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/campaigns/${c.id}`} className="text-sm font-semibold text-slate-100 hover:text-brand-300">{c.name}</Link>
                    <p className="text-xs text-slate-500">{c.vertical} · {personaName(c.personaId)}{stepsOf(c.id) > 0 ? ` · ${stepsOf(c.id)}-step sequence` : ""} · cap {num(c.dailyCap)}/day</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag tone={c.status === "active" ? "ok" : c.status === "draft" ? "warn" : "slate"}>{titleCase(c.status)}</Tag>
                    {card && <HealthBadge health={card.health} />}
                  </div>
                </div>
                {card && card.sent > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-3 text-xs sm:grid-cols-5">
                    <Mini label="Sent" value={num(card.sent)} />
                    <Mini label="Open" value={pct(card.openRate)} />
                    <Mini label="Reply" value={pct(card.replyRate, 1)} />
                    <Mini label="Positive" value={pct(card.positiveRate, 1)} />
                    <Mini label="Bounce" value={pct(card.bounceRate, 1)} />
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <CampaignActions id={c.id} status={c.status} />
                  <Link href={`/campaigns/${c.id}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300">
                    View sequence <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ink-800/60 p-2 text-center">
      <div className="text-sm font-semibold tabular-nums text-slate-100">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
