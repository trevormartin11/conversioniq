import { Copy, Pause, Play } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { HealthBadge, Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhaseBanner } from "@/components/ui/phase-banner";
import { NewCampaignForm } from "@/components/campaigns/new-campaign-form";
import { campaignCards } from "@/lib/data/queries";
import { getCampaigns, getPersonas } from "@/lib/data/store";
import { num, pct, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function CampaignsPage() {
  const campaigns = getCampaigns();
  const cards = campaignCards();
  const personas = getPersonas();
  const cardFor = (id: string) => cards.find((c) => c.id === id);
  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? "—";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Campaigns</h1>
          <p className="text-sm text-slate-500">Parallel cells by vertical.</p>
        </div>
        <NewCampaignForm personas={personas} />
      </div>

      <PhaseBanner phase={2}>
        You can stage draft campaigns now. Pause / clone, inbox & persona assignment, schedules and sequence editing — plus launching into Instantly — are wired here next.
      </PhaseBanner>

      <div className="space-y-3">
        {campaigns.map((c) => {
          const card = cardFor(c.id);
          return (
            <Card key={c.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.vertical} · {personaName(c.personaId)} · {c.inboxIds.length} inboxes · cap {num(c.dailyCap)}/day</p>
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
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="ghost" disabled>{c.status === "active" ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Launch</>}</Button>
                  <Button size="sm" variant="ghost" disabled><Copy className="h-3.5 w-3.5" /> Clone</Button>
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
