/** Reply drafting — Claude grounded in Trevor's outreach voice, rules templates as fallback. */
import { aiAvailable, complete } from "@/lib/integrations/anthropic";
import { voiceSystemPrompt } from "./voice";
import type { ReplyClass } from "@/lib/data/types";

export interface Draft {
  draft: string | null;
  source: "ai" | "rules" | null;
}

/** Minimal shapes so this works from both the store (full Reply/Lead) and syncs. */
type ReplyLike = { classification: ReplyClass; body: string; fromName: string };
type LeadLike = { firstName?: string; company?: string; vertical?: string; title?: string } | null;

/** Classes we never auto-draft a reply for (they get actioned, not answered). */
const NO_REPLY: ReplyClass[] = ["unsubscribe", "negative", "ooo"];

function rulesDraft(reply: ReplyLike, lead: LeadLike): Draft {
  const name = lead?.firstName || reply.fromName.split(" ")[0] || "there";
  const company = lead?.company || "your spa";
  const map: Partial<Record<ReplyClass, string>> = {
    interested: `Love it, ${name}. Quickest way to show you is a 30-second example of it handling the after-hours "how much?" messages for a spa like ${company}. Want me to send that over, or grab 15 min this week?\n\nTrevor`,
    question: `Good question, ${name}. Short version: it answers your DMs, comments and site chat in your spa's voice, 24/7, and books the consult instead of leaving a cold lead. Happy to show you live — worth a quick look?\n\nTrevor`,
    objection: `Totally fair, ${name} — that's the first thing owners worry about. You set the voice and the rules, it stays inside them, and anything sensitive routes to your team. No rogue replies. Easier to judge seeing it live — open to a peek?\n\nTrevor`,
    not_now: `No worries at all, ${name}. I'll circle back later. If the after-hours stuff ever starts bugging you, just reply "demo" and I'll show you how the spas handling it set it up.\n\nTrevor`,
    referral: `Appreciate it, ${name} — I'll reach out to them directly and keep you off the thread. Thanks!\n\nTrevor`,
  };
  const draft = map[reply.classification];
  return draft ? { draft, source: "rules" } : { draft: null, source: null };
}

export async function draftReply(reply: ReplyLike, lead: LeadLike): Promise<Draft> {
  if (NO_REPLY.includes(reply.classification)) return { draft: null, source: null };
  if (!aiAvailable()) return rulesDraft(reply, lead);
  try {
    const draft = await complete({
      system: voiceSystemPrompt(),
      user: [
        `Draft a short reply (40-80 words) in Trevor's voice that moves the prospect toward a quick, low-friction look at ConversionIQ (a 30-second example or a 15-minute demo).`,
        `Prospect: ${reply.fromName}${lead ? ` (${lead.title} at ${lead.company}, vertical: ${lead.vertical})` : ""}.`,
        `Their reply was classified as: ${reply.classification}.`,
        `Their message:\n"""${reply.body}"""`,
        `Write ONLY the reply body. Keep it human and short, one soft ask, and sign off "Trevor". No subject line.`,
      ].join("\n"),
      maxTokens: 280,
      temperature: 0.5,
    });
    return { draft, source: "ai" };
  } catch {
    return rulesDraft(reply, lead);
  }
}
