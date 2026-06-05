"use server";

import { ensureData, getCampaigns, getReplies, getVariants, pushAudit } from "@/lib/data/store";
import { getCurrentUser } from "@/lib/auth";
import { deriveLearnings } from "@/lib/ai/learnings";
import { generateSequence } from "@/lib/ai/copy";
import { proposeVerticals } from "@/lib/ai/strategy";
import { createInstantlyCampaign } from "@/lib/integrations/instantly";
import { syncCampaigns } from "@/lib/sync/campaigns";
import { integrations } from "@/lib/config";

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

/** Turn a drafted sequence into a DRAFT campaign in Instantly (never auto-launched). */
export async function createCampaignFromDraftAction(input: {
  name: string;
  vertical: string;
  steps: { subject: string; body: string }[];
  inboxEmails: string[];
  dailyCap: number;
}) {
  await ensureData();
  const user = await getCurrentUser();
  if (!integrations.instantly) return { ok: false as const, error: "Instantly isn't connected." };
  if (!input.steps.length) return { ok: false as const, error: "Draft a sequence first." };
  if (!input.inboxEmails.length) return { ok: false as const, error: "Select at least one inbox to send from." };
  try {
    const { id } = await createInstantlyCampaign({
      name: input.name.trim() || `CIQ ${input.vertical}`,
      steps: input.steps,
      inboxEmails: input.inboxEmails,
      dailyLimit: input.dailyCap || 100,
    });
    if (!id) return { ok: false as const, error: "Instantly did not return a campaign id." };
    await syncCampaigns();
    await pushAudit(user.name, "campaign.created_from_draft", "campaign", `c_${id}`, { name: input.name, vertical: input.vertical, inboxes: input.inboxEmails.length });
    return { ok: true as const, id: `c_${id}` };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
