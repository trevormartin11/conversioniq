"use server";

import { ensureData, getReplies, getVariants } from "@/lib/data/store";
import { deriveLearnings } from "@/lib/ai/learnings";
import { generateSequence, type GeneratedStep } from "@/lib/ai/copy";

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
