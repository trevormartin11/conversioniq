"use server";

import { ensureData, getCampaigns, getReplies, getVariants } from "@/lib/data/store";
import { deriveLearnings } from "@/lib/ai/learnings";
import { generateSequence } from "@/lib/ai/copy";
import { proposeVerticals } from "@/lib/ai/strategy";

function learnings() {
  return deriveLearnings(getVariants(), getReplies().map((r) => r.classification));
}

/** Draft a new-campaign sequence, applying learnings + an optional vertical brief. */
export async function generateSequenceAction(vertical: string, brief?: string) {
  await ensureData();
  return generateSequence(vertical.trim() || "General", learnings(), brief);
}

/** Propose target verticals (scored on ICP fit) we aren't already running. */
export async function proposeVerticalsAction() {
  await ensureData();
  const existing = [...new Set(getCampaigns().map((c) => c.vertical).filter((v) => v && v !== "General"))];
  return proposeVerticals(existing, learnings());
}
