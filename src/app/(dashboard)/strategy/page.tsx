import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card, CardBody, PageHeader, SectionHeader } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { ensureData, getCampaigns, getVariants, getReplies } from "@/lib/data/store";
import { ICP_FIT, proposeVerticals } from "@/lib/ai/strategy";
import { deriveLearnings } from "@/lib/ai/learnings";

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  await ensureData();
  const campaigns = getCampaigns();
  const running = Array.from(new Set(campaigns.map((c) => c.vertical)));
  const active = new Set(campaigns.filter((c) => c.status === "active").map((c) => c.vertical));
  const learnings = deriveLearnings(getVariants(), getReplies().map((r) => r.classification));
  const ideas = await proposeVerticals(running, learnings);
  const aiSourced = ideas[0]?.source === "ai";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Strategy"
        subtitle="Step 1 — who we point the fleet at, and why. North star: 2 booked demos/day."
      />

      {/* ICP */}
      <section>
        <SectionHeader title="Who ConversionIQ wins with" />
        <Card><CardBody>
          <p className="text-sm leading-relaxed text-slate-300">{ICP_FIT}</p>
        </CardBody></Card>
      </section>

      {/* Currently running */}
      <section>
        <SectionHeader title="Currently running" subtitle="Verticals with a campaign in the fleet." />
        {running.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing running yet — pick a target below to launch the first campaign.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {running.map((v) => (
              <Tag key={v} tone={active.has(v) ? "ok" : "slate"}>{v}{active.has(v) ? " · active" : " · draft"}</Tag>
            ))}
          </div>
        )}
      </section>

      {/* Proposed next targets */}
      <section>
        <SectionHeader
          title="Proposed next targets"
          subtitle={aiSourced ? "AI-proposed against the ICP + what we've learned." : "Starting playbook — refines as the AI sees real results."}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {ideas.map((idea) => (
            <Card key={idea.vertical}>
              <CardBody>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{idea.vertical}</p>
                  <Tag tone={idea.fit >= 8 ? "ok" : "slate"}>Fit {idea.fit}/10</Tag>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">{idea.why}</p>
                <p className="mt-2 text-xs text-slate-300"><span className="text-slate-500">Open with:</span> {idea.angle}</p>
              </CardBody>
            </Card>
          ))}
        </div>
        <Link href="/source" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300">
          <Sparkles className="h-3.5 w-3.5" /> Next: find the people in Source →
        </Link>
      </section>
    </div>
  );
}
