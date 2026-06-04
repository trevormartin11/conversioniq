import Link from "next/link";
import { Coins, Flame, Inbox, ShieldAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardBody, SectionHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { HealthBadge } from "@/components/ui/badge";
import { LabeledBar, Sparkline } from "@/components/ui/charts";
import { commandSummary, deliverabilitySummary } from "@/lib/data/queries";
import { ensureData } from "@/lib/data/store";
import { getCurrentUser } from "@/lib/auth";
import { num, pct, titleCase } from "@/lib/format";
import type { CampaignCard as CardData } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

export default async function CommandCenter() {
  await ensureData();
  const s = commandSummary();
  const deliver = deliverabilitySummary();
  const user = await getCurrentUser();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const maxClass = Math.max(1, ...Object.values(s.replyClassCounts));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">
          {greeting}, {user.name.split(" ")[0]}.
        </h1>
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · 10-second read
        </p>
      </div>

      {/* Alerts */}
      {s.alerts.length > 0 && (
        <div className="space-y-2">
          {s.alerts.map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border border-l-2 px-4 py-3",
                a.level === "red" && "border-bad/30 border-l-bad bg-bad/[0.07]",
                a.level === "yellow" && "border-warn/30 border-l-warn bg-warn/[0.07]",
                a.level === "green" && "border-ink-700 border-l-ok bg-ink-850",
              )}
            >
              <HealthBadge health={a.level} label={a.level === "red" ? "Urgent" : a.level === "yellow" ? "Attention" : "Info"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-200">{a.title}</p>
                <p className="text-xs text-slate-500">{a.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Needs you now — the actionable, tappable summary */}
      <div className="flex flex-wrap gap-2">
        {s.queueDepth > 0 && <ActionChip href="/replies" icon={Inbox} tone={s.hotCount > 0 ? "warn" : "brand"} label={`${s.queueDepth} repl${s.queueDepth === 1 ? "y" : "ies"} to review`} />}
        {s.hotCount > 0 && <ActionChip href="/replies" icon={Flame} tone="warn" label={`${s.hotCount} hot`} />}
        {s.creditApprovals > 0 && <ActionChip href="/credits" icon={Coins} tone="warn" label={`${s.creditApprovals} credit approval${s.creditApprovals === 1 ? "" : "s"}`} />}
        {s.pausedInboxes > 0 && <ActionChip href="/deliverability" icon={ShieldAlert} tone="bad" label={`${s.pausedInboxes} inbox${s.pausedInboxes === 1 ? "" : "es"} paused`} />}
        {s.queueDepth === 0 && s.creditApprovals === 0 && s.pausedInboxes === 0 && (
          <span className="chip bg-ok/15 px-3 py-1.5 text-emerald-300 ring-1 ring-inset ring-ok/25">All caught up — nothing needs you right now ✓</span>
        )}
      </div>

      {/* Today */}
      <section>
        <SectionHeader title="Today" subtitle="Across all live campaigns" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Sends" value={num(s.today.sends)} sub={`${deliver.sentToday} from inboxes`} />
          <Stat label="Replies" value={num(s.today.replies)} tone="brand" />
          <Stat label="Positive" value={num(s.today.positives)} tone="ok" />
          <Stat label="Demos booked" value={num(s.demosBooked)} tone="ok" />
          <Stat label="Queue" value={num(s.queueDepth)} sub="awaiting approval" tone={s.queueDepth > 0 ? "warn" : "default"} />
        </div>
      </section>

      {/* Replies by type + trend */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <SectionHeader title="Replies by type" subtitle="All inboxes & campaigns" />
            <div className="space-y-2">
              {Object.entries(s.replyClassCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([cls, count]) => (
                  <LabeledBar
                    key={cls}
                    label={titleCase(cls)}
                    value={count}
                    max={maxClass}
                    tone={cls === "interested" ? "ok" : cls === "negative" || cls === "unsubscribe" ? "bad" : cls === "objection" ? "warn" : "brand"}
                  />
                ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <SectionHeader title="14-day trend" subtitle="Med Spa — sends vs positive replies" />
            <Sparkline data={s.trend.map((t) => t.sends)} />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Sends" value={num(s.trend.reduce((a, t) => a + t.sends, 0))} />
              <MiniStat label="Replies" value={num(s.trend.reduce((a, t) => a + t.replies, 0))} />
              <MiniStat label="Positive" value={num(s.trend.reduce((a, t) => a + t.positives, 0))} />
            </div>
          </CardBody>
        </Card>
      </section>

      {/* Campaign cards */}
      <section>
        <SectionHeader title="Campaigns" subtitle="Per-cell health" action={<Link href="/campaigns" className="text-xs text-brand-400 hover:underline">Manage →</Link>} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {s.cards.map((c) => (
            <CampaignCard key={c.id} card={c} />
          ))}
        </div>
      </section>

      {/* Deliverability glance */}
      <section>
        <SectionHeader title="Deliverability" subtitle="Inbox fleet health" action={<Link href="/deliverability" className="text-xs text-brand-400 hover:underline">Details →</Link>} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Inboxes" value={num(deliver.total)} sub={`${deliver.active} active`} />
          <Stat label="Warming" value={num(deliver.warming)} sub={`${deliver.belowGate} below gate`} tone="warn" />
          <Stat label="Paused" value={num(deliver.paused)} tone={deliver.paused > 0 ? "bad" : "default"} />
          <Stat label="Capacity" value={`${num(deliver.sentToday)}/${num(deliver.capacity)}`} sub="sent / daily cap" />
        </div>
      </section>
    </div>
  );
}

function ActionChip({ href, icon: Icon, label, tone }: { href: string; icon: LucideIcon; label: string; tone: "brand" | "warn" | "bad" }) {
  const styles = {
    brand: "border-brand-500/30 bg-brand-600/10 text-brand-300 hover:bg-brand-600/20",
    warn: "border-warn/30 bg-warn/10 text-amber-300 hover:bg-warn/20",
    bad: "border-bad/30 bg-bad/10 text-red-300 hover:bg-bad/20",
  }[tone];
  return (
    <Link href={href} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors", styles)}>
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ink-800/60 py-2">
      <div className="text-sm font-semibold tabular-nums text-slate-100">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function CampaignCard({ card }: { card: CardData }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-100">{card.name}</p>
            <p className="text-xs text-slate-500">{card.vertical} · {titleCase(card.status)}</p>
          </div>
          <HealthBadge health={card.health} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Metric label="Sent" value={num(card.sent)} />
          <Metric label="Open" value={pct(card.openRate, 0)} />
          <Metric label="Reply" value={pct(card.replyRate, 1)} />
          <Metric label="Positive" value={pct(card.positiveRate, 1)} />
          <Metric label="Bounce" value={pct(card.bounceRate, 1)} tone={card.bounceRate > 0.05 ? "bad" : "default"} />
        </div>
      </CardBody>
    </Card>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "bad" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={tone === "bad" ? "font-medium tabular-nums text-bad" : "font-medium tabular-nums text-slate-200"}>{value}</span>
    </div>
  );
}
