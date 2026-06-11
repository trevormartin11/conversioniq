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

function rulesDraft(reply: ReplyLike, lead: LeadLike, senderName: string): Draft {
  const name = lead?.firstName || reply.fromName.split(" ")[0] || "there";
  const company = lead?.company || "your business";
  const map: Partial<Record<ReplyClass, string>> = {
    interested: `Love it, ${name}. Quickest way to show you is a 30-second example of it catching the after-hours messages and anonymous visitors ${company} is losing right now. Want me to send that over, or grab 15 min this week?\n\n${senderName}`,
    question: `Good question, ${name}. Short version: it answers your DMs, comments and texts in your brand's voice 24/7, works out who the anonymous visitors are without a form, and books them — on whichever channel they're already in. Happy to show you live — worth a quick look?\n\n${senderName}`,
    objection: `Totally fair, ${name} — that's the first thing owners worry about. You set the voice and the rules, it stays inside them, and anything sensitive routes to your team. No rogue replies. Easier to judge seeing it live — open to a peek?\n\n${senderName}`,
    not_now: `No worries at all, ${name}. I'll circle back later. If the missed after-hours messages and anonymous visitors ever start bugging you, just reply "demo" and I'll show you how others are catching them automatically.\n\n${senderName}`,
    referral: `Appreciate it, ${name} — I'll reach out to them directly and keep you off the thread. Thanks!\n\n${senderName}`,
  };
  const draft = map[reply.classification];
  return draft ? { draft, source: "rules" } : { draft: null, source: null };
}

export async function draftReply(reply: ReplyLike, lead: LeadLike, senderName = "Trevor"): Promise<Draft> {
  if (NO_REPLY.includes(reply.classification)) return { draft: null, source: null };
  if (!aiAvailable()) return rulesDraft(reply, lead, senderName);
  try {
    const draft = await complete({
      system: voiceSystemPrompt(),
      user: [
        `Draft a short reply (40-80 words) in ${senderName}'s voice that moves the prospect toward a quick, low-friction look at ConversionIQ (a 30-second example or a 15-minute demo).`,
        `Prospect: ${reply.fromName}${lead ? ` (${lead.title} at ${lead.company}, vertical: ${lead.vertical})` : ""}.`,
        `Their reply was classified as: ${reply.classification}.`,
        `Their message:\n"""${reply.body}"""`,
        `Write ONLY the reply body. Keep it human and short, one soft ask, and sign off "${senderName}". No subject line.`,
      ].join("\n"),
      maxTokens: 280,
      temperature: 0.5,
      purpose: "drafting",
    });
    return { draft, source: "ai" };
  } catch {
    return rulesDraft(reply, lead, senderName);
  }
}
