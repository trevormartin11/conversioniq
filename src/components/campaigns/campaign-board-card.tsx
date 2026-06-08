import Link from "next/link";
import { CalendarCheck, ChevronRight, Send, ShieldCheck, Users } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { HealthBadge, Tag } from "@/components/ui/badge";
import { Progress } from "@/components/ui/charts";
import { CampaignActions } from "./campaign-actions";
import { num, pct, titleCase } from "@/lib/format";
import type { CampaignBoardCard as BoardCard } from "@/lib/data/queries";

const ACCENT: Record<string, string> = {
  active: "border-l-ok/70",
  draft: "border-l-warn/60",
  paused: "border-l-slate-400/40",
  completed: "border-l-slate-600/40",
};

/** One campaign on the board — funnel + leads/pace + pipeline + deliverability at a glance,
 *  visible even before the first send (everything reads as zero rather than disappearing). */
export function CampaignBoardCard({ c }: { c: BoardCard }) {
  const worked = c.leadsLoaded > 0 ? (c.leadsLoaded - c.leadsRemaining) / c.leadsLoaded : 0;
  return (
    <Card className={`border-l-2 ${ACCENT[c.status] ?? "border-l-slate-600/40"}`}>
      <CardBody className="space-y-3">
        {/* header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/campaigns/${c.id}`} className="text-sm font-semibold text-slate-100 hover:text-brand-300">{c.name}</Link>
            <p className="truncate text-xs text-slate-500">
              {c.vertical} · {c.personaName} · {c.steps > 0 ? `${c.steps}-step` : "no sequence"} · cap {num(c.dailyCap)}/day
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Tag tone={c.status === "active" ? "ok" : c.status === "draft" ? "warn" : "slate"}>{titleCase(c.status)}</Tag>
            <HealthBadge health={c.health} />
          </div>
        </div>

        {/* four groups */}
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* leads + pace */}
          <Tile icon={Users} label="Leads">
            <Figure value={num(c.leadsLoaded)} unit="loaded" />
            {c.leadsLoaded === 0 ? (
              <Link href="/leads" className="text-[11px] font-medium text-brand-400 hover:text-brand-300">Add leads →</Link>
            ) : (
              <>
                <p className="text-[11px] text-slate-500">
                  {c.leadsRemaining > 0 ? `${num(c.leadsRemaining)} to send${c.runwayDays ? ` · ~${c.runwayDays}d` : ""}` : "list worked through"}
                </p>
                <Progress value={worked} tone="ok" />
              </>
            )}
          </Tile>

          {/* funnel */}
          <Tile icon={Send} label="Outreach">
            <Figure value={num(c.sent)} unit="sent" />
            <p className="text-[11px] text-slate-500">Open {pct(c.openRate)} · Reply {pct(c.replyRate, 1)}</p>
            <p className="text-[11px] text-slate-500">
              Positive {pct(c.positiveRate, 1)} · <span className={c.bounceRate > 0.03 ? "text-warn" : ""}>Bounce {pct(c.bounceRate, 1)}</span>
            </p>
          </Tile>

          {/* pipeline */}
          <Tile icon={CalendarCheck} label="Pipeline">
            <Figure value={num(c.demos)} unit={c.demos === 1 ? "demo" : "demos"} />
            <p className="text-[11px] text-slate-500">{c.demosWon > 0 ? `${num(c.demosWon)} won · ` : ""}{num(c.interestedReplies)} interested</p>
          </Tile>

          {/* deliverability */}
          <Tile icon={ShieldCheck} label="Sending">
            <Figure value={num(c.inboxCount)} unit={c.inboxCount === 1 ? "inbox" : "inboxes"} />
            <p className="text-[11px] text-slate-500">{c.warmupAvg}% warm avg</p>
            {c.inboxesUnderWarmup > 0 && <p className="text-[11px] text-warn">{c.inboxesUnderWarmup} under warmup</p>}
          </Tile>
        </div>

        {/* actions */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <CampaignActions id={c.id} status={c.status} />
          <Link href={`/campaigns/${c.id}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300">
            Open <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}

function Tile({ icon: Icon, label, children }: { icon: typeof Users; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-lg bg-ink-800/50 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </div>
      {children}
    </div>
  );
}

function Figure({ value, unit }: { value: string; unit: string }) {
  return (
    <p className="text-lg font-semibold leading-none tabular-nums text-slate-100">
      {value} <span className="text-[11px] font-normal text-slate-500">{unit}</span>
    </p>
  );
}
