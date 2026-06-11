import { Card, CardBody, PageHeader, SectionHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Tag } from "@/components/ui/badge";
import { Progress } from "@/components/ui/charts";
import { Lightbulb } from "lucide-react";
import { IcpEditor } from "@/components/strategy/icp-editor";
import { ensureData, getDemos, getIcp, getReplies, getVariants } from "@/lib/data/store";
import { ICP_FIT } from "@/lib/ai/strategy";
import { deriveLearnings } from "@/lib/ai/learnings";
import { appConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  await ensureData();
  const icp = getIcp();
  const learnings = deriveLearnings(getVariants(), getReplies().map((r) => r.classification));

  // North-star tracking — pace toward the goal of 2 booked demos/day.
  const demos = getDemos();
  const now = Date.now();
  const cutoff = now - 30 * 864e5;
  const ts = (iso: string) => Date.parse(iso);
  const booked30 = demos.filter((d) => { const t = ts(d.scheduledAt); return Number.isFinite(t) && t >= cutoff && t <= now; }).length;
  const won = demos.filter((d) => d.status === "closed").length;
  const upcoming = demos.filter((d) => d.status === "booked" && ts(d.scheduledAt) > now).length;
  const targetPerDay = appConfig.goals.demosPerDay;
  const targetPerMonth = targetPerDay * 30;
  const pacePerDay = booked30 / 30;

  return (
    <div className="space-y-6">
      <PageHeader title="Strategy" subtitle={`Who we point the fleet at, and how we're tracking. North star: ${targetPerDay} booked demos/day.`} />

      {/* North star */}
      <section>
        <SectionHeader title="North star" subtitle={`Booked demos vs. the ${targetPerDay}/day goal (last 30 days).`} />
        <Card>
          <CardBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Booked (30d)" value={String(booked30)} />
              <Stat label="Pace / day" value={pacePerDay.toFixed(1)} sub={`goal ${targetPerDay}/day`} tone={pacePerDay >= targetPerDay ? "ok" : "default"} />
              <Stat label="Upcoming" value={String(upcoming)} />
              <Stat label="Won" value={String(won)} tone={won ? "ok" : "default"} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span>Progress to {targetPerMonth}/mo</span>
                <span className="tabular-nums">{booked30}/{targetPerMonth}</span>
              </div>
              <Progress value={targetPerMonth ? booked30 / targetPerMonth : 0} tone={booked30 >= targetPerMonth ? "ok" : "brand"} />
            </div>
          </CardBody>
        </Card>
      </section>

      {/* Editable, AI-wired ICP */}
      <section>
        <SectionHeader title="Targeting" subtitle="The ICP the strategy AI reads from when proposing verticals and the problems to lead with." />
        <IcpEditor value={icp ?? ICP_FIT} custom={icp !== null} defaultText={ICP_FIT} />
      </section>

      {/* What we've learned — the single home for cross-campaign memory */}
      <section>
        <SectionHeader title="What we've learned" subtitle="Cross-campaign memory from live replies + sequence performance — applied to every new sequence, and feeds the next move in Analysis." />
        {learnings.length === 0 ? (
          <Card><CardBody className="text-sm text-slate-500">Not enough signal yet — insights appear as replies and sends accrue.</CardBody></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {learnings.map((l, i) => (
              <Card key={i}>
                <CardBody className="flex gap-3">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
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
        )}
      </section>
    </div>
  );
}
