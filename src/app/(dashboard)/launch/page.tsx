import { PageHeader } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { LaunchWizard } from "@/components/launch/launch-wizard";
import { ensureData, getCampaigns, getPersonas, getReplies, getVariants } from "@/lib/data/store";
import { proposeVerticals } from "@/lib/ai/strategy";
import { deriveLearnings } from "@/lib/ai/learnings";
import { appConfig, integrations } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function LaunchPage() {
  await ensureData(["campaigns", "personas", "replies", "variants", "demos"]);
  const personas = getPersonas().map((p) => ({ id: p.id, name: p.name }));
  const running = Array.from(new Set(getCampaigns().map((c) => c.vertical)));
  const learnings = deriveLearnings(getVariants(), getReplies().map((r) => r.classification));
  const ideas = await proposeVerticals(running, learnings.map((l) => ({ theme: l.theme, insight: l.insight })));
  const suggestions = ideas.slice(0, 6).map((i) => i.vertical);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Launch a campaign"
        subtitle="End to end: vertical & problem → the people → sequence & cadence → send."
        action={<Tag tone="brand">Goal: {appConfig.goals.demosPerDay} demos/day</Tag>}
      />
      <LaunchWizard
        personas={personas}
        suggestions={suggestions}
        dailyGoal={appConfig.goals.demosPerDay}
        monthlyBudget={appConfig.goals.monthlyBudgetUsd}
        aiOn={integrations.anthropic}
      />
    </div>
  );
}
