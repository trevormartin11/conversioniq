"use server";

import { ensureData, getReplies, getVariants } from "@/lib/data/store";
import { deriveLearnings } from "@/lib/ai/learnings";
import { generateSequence } from "@/lib/ai/copy";

/** Draft a new-campaign sequence, applying the cross-campaign learnings. */
export async function generateSequenceAction(vertical: string) {
  await ensureData();
  const learnings = deriveLearnings(getVariants(), getReplies().map((r) => r.classification));
  return generateSequence(vertical.trim() || "General", learnings);
}
