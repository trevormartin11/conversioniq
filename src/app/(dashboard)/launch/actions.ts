"use server";

import { ensureData, getCampaigns, getReplies, getVariants } from "@/lib/data/store";
import { deriveLearnings } from "@/lib/ai/learnings";
import { generateSequence, type GeneratedStep } from "@/lib/ai/copy";
import { proposeVerticals, suggestProblems, suggestTitles, suggestVerticalsForProblem } from "@/lib/ai/strategy";

/** Preview a generated sequence for the launch wizard's Copy step. */
export async function previewSequenceAction(
  vertical: string,
  brief?: string,
): Promise<
  | { ok: true; steps: GeneratedStep[]; source: "ai" | "rules" }
  | { ok: false; error: string }
> {
  await ensureData();
  if (!vertical.trim()) return { ok: false, error: "Pick a vertical first." };
  const learnings = deriveLearnings(getVariants(), getReplies().map((r) => r.classification));
  const { steps, source } = await generateSequence(
    vertical.trim(),
    learnings.map((l) => ({ theme: l.theme, insight: l.insight })),
    brief?.trim() || undefined,
  );
  return { ok: true, steps, source };
}

/** Suggest target verticals — tailored to a typed problem if given, else strong-fit proposals. Each carries its cold-open angle. */
export async function suggestVerticalsAction(problem?: string): Promise<{ ideas: { vertical: string; angle: string; fit: number }[] }> {
  await ensureData();
  const running = Array.from(new Set(getCampaigns().map((c) => c.vertical)));
  const learnings = deriveLearnings(getVariants(), getReplies().map((r) => r.classification));
  const ideas = problem?.trim()
    ? await suggestVerticalsForProblem(problem, running)
    : await proposeVerticals(running, learnings.map((l) => ({ theme: l.theme, insight: l.insight })));
  return { ideas: ideas.map((i) => ({ vertical: i.vertical, angle: i.angle, fit: i.fit })) };
}

/** Suggest the specific problems CIQ solves for a vertical (cold-open ready). */
export async function suggestProblemsAction(vertical: string): Promise<{ problems: string[] }> {
  return { problems: (await suggestProblems(vertical)).problems };
}

/** Suggest buyer titles/roles that own the problem in a vertical. */
export async function suggestTitlesAction(vertical: string, problem?: string): Promise<{ titles: string[] }> {
  return { titles: (await suggestTitles(vertical, problem)).titles };
}
