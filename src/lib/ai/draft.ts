/** Reply drafting — Claude grounded in CIQ voice, with rules templates as fallback. */
import { aiAvailable, complete } from "@/lib/integrations/anthropic";
import { voiceSystemPrompt } from "./voice";
import type { Lead, Reply, ReplyClass } from "@/lib/data/types";

export interface Draft {
  draft: string | null;
  source: "ai" | "rules" | null;
}

/** Classes we never auto-draft a reply for (they get actioned, not answered). */
const NO_REPLY: ReplyClass[] = ["unsubscribe", "negative", "ooo"];

function rulesDraft(reply: Reply, lead: Lead | null): Draft {
  const name = lead?.firstName || reply.fromName.split(" ")[0] || "there";
  const company = lead?.company || "your team";
  const cta = "Do you have 15 minutes Thursday at 11a or 2p ET for a quick demo?";
  const map: Partial<Record<ReplyClass, string>> = {
    interested: `Hi ${name} — great to hear. ConversionIQ engages and books your leads automatically, 24/7, so nothing slips after hours. Most teams are live in minutes. ${cta}`,
    question: `Hi ${name} — happy to help. It works alongside what you already use (an overlay, not a replacement) and handles engagement + booking across web, SMS and social automatically. Easiest to see it live — ${cta}`,
    objection: `Totally fair, ${name}. Unlike scripted bots, the agents use intent-based reasoning tethered to your brand data, so replies stay on-brand. Rather than take my word, I can show you 3 minutes of it handling real ${lead?.vertical ?? "industry"} questions. Worth a quick look?`,
    not_now: `No problem, ${name} — I'll circle back when timing's better and hold a demo slot for you in the meantime. Appreciate you letting me know.`,
    referral: `Thanks ${name} — I appreciate the pointer. I'll reach out to them directly and keep you off the thread. Have a great week!`,
  };
  const draft = map[reply.classification];
  return draft ? { draft: `${draft}\n\n— ${reply.fromName ? "" : ""}`.trim(), source: "rules" } : { draft: null, source: null };
}

export async function draftReply(reply: Reply, lead: Lead | null): Promise<Draft> {
  if (NO_REPLY.includes(reply.classification)) return { draft: null, source: null };
  if (!aiAvailable()) return rulesDraft(reply, lead);
  try {
    const draft = await complete({
      system: voiceSystemPrompt(),
      user: [
        `Draft a short, warm reply (60-90 words) that moves the prospect toward booking a 15-minute ConversionIQ demo.`,
        `Prospect: ${reply.fromName}${lead ? ` (${lead.title} at ${lead.company}, vertical: ${lead.vertical})` : ""}.`,
        `Their reply was classified as: ${reply.classification}.`,
        `Their message:\n"""${reply.body}"""`,
        `Write ONLY the reply body (no subject, no signature). One clear ask.`,
      ].join("\n"),
      maxTokens: 300,
      temperature: 0.5,
    });
    return { draft, source: "ai" };
  } catch {
    return rulesDraft(reply, lead);
  }
}
