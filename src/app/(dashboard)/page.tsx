import Link from "next/link";
import { Flame, Inbox, ShieldAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardBody, SectionHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { HealthBadge } from "@/components/ui/badge";
import { LabeledBar, Sparkline } from "@/components/ui/charts";
import { commandSummary, deliverabilitySummary, northStar, unitEconomics } from "@/lib/data/queries";
import { ensureData } from "@/lib/data/store";
import { getCurrentUser } from "@/lib/auth";
import { num, pct, titleCase, usd } from "@/lib/format";
import type { CampaignCard as CardData } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

export default async function CommandCenter() {
  await ensureData();
  const s = commandSummary();
  const deliver = deliverabilitySummary();
  const econ = unitEconomics();
  const ns = northStar();
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

      {/* North star — the number we run to blow past */}
      <section>
        <Card>
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Demos booked today</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-100">
                {ns.todayDemos}
                <span className="text-lg font-normal text-slate-500"> / {ns.dailyGoal} goal</span>
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-800">
                <div
                  className={cn("h-full rounded-full", ns.todayDemos >= ns.dailyGoal ? "bg-ok" : "bg-brand-gradient")}
                  style={{ width: `${Math.min(100, ns.dailyGoal ? (ns.todayDemos / ns.dailyGoal) * 100 : 0)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {ns.weekDemos} of {ns.weeklyGoal} this week
              </p>
            </div>
            <Stat
              label="Monthly spend"
              value={`${usd(ns.monthlySpend)} / ${usd(ns.budget)}`}
              sub={ns.monthlySpend <= ns.budget ? `${usd(ns.budget - ns.monthlySpend)} under ceiling` : `${usd(ns.monthlySpend - ns.budget)} over ceiling`}
              tone={ns.monthlySpend <= ns.budget ? "ok" : "bad"}
            />
            <Stat
              label="Residual run-rate"
              value={`${usd(ns.grossResidualMonthly)}/mo`}
              sub={`${usd(ns.netPerPartnerMonthly)}/mo each after costs`}
              tone={ns.breakeven ? "ok" : "warn"}
            />
          </CardBody>
        </Card>
      </section>

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
        {s.pausedInboxes > 0 && <ActionChip href="/deliverability" icon={ShieldAlert} tone="bad" label={`${s.pausedInboxes} inbox${s.pausedInboxes === 1 ? "" : "es"} paused`} />}
        {s.queueDepth === 0 && s.creditApprovals === 0 && s.pausedInboxes === 0 && (
          <span className="chip bg-ok/15 px-3 py-1.5 text-emerald-300 ring-1 ring-inset ring-ok/25">All caught up — nothing needs you right now ✓</span>
        )}
      </div>

      {/* Today */}
      <section>
        <SectionHeader title="Today" subtitle="Across all live campaigns" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Sends" value={num(s.today.sends)} sub={`${deliver.sentToday} from inboxes`} />
          <Stat label="Replies" value={num(s.today.replies)} tone="brand" />
          <Stat label="Positive" value={num(s.today.positives)} tone="ok" />
          <Stat label="Queue" value={num(s.queueDepth)} sub="awaiting approval" tone={s.queueDepth > 0 ? "warn" : "default"} />
        </div>
      </section>

      {/* Unit economics — is the machine profitable? */}
      <section>
        <SectionHeader title="Unit economics" subtitle="What a demo and a customer actually cost — blended to date" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Cost / demo" value={econ.costPerDemo != null ? usd(econ.costPerDemo) : "—"} tone="brand" />
          <Stat label="CAC / close" value={econ.cac != null ? usd(econ.cac) : "—"} sub={`${pct(econ.closeRate)} close rate`} />
          <Stat
            label="Payback"
            value={econ.paybackMonths != null ? `${econ.paybackMonths.toFixed(1)} mo` : "—"}
            sub="CAC ÷ residual/mo"
            tone={econ.paybackMonths == null ? "default" : econ.paybackMonths <= 12 ? "ok" : econ.paybackMonths <= 24 ? "warn" : "bad"}
          />
          <Stat label="Monthly burn" value={usd(econ.monthlyBurn)} />
          <Stat label="Invested to date" value={usd(econ.investedToDate)} sub={`${num(econ.demosBooked)} demos · ${num(econ.closed)} closed`} />
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
    <Link href="/campaigns" className="block">
      <Card className="card-link h-full">
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
    </Link>
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
