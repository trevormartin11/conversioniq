/** Reply classification — Claude when available, keyword rules as fallback. */
import { aiAvailable, complete } from "@/lib/integrations/anthropic";
import { REPLY_CLASSES, type ReplyClass } from "@/lib/data/types";

export interface Classification {
  classification: ReplyClass;
  confidence: number;
  source: "ai" | "rules";
}

const RULES: { cls: ReplyClass; patterns: RegExp[] }[] = [
  { cls: "unsubscribe", patterns: [/unsubscribe/i, /remove me/i, /opt out/i, /take me off/i] },
  { cls: "negative", patterns: [/not interested/i, /no thanks/i, /stop emailing/i, /\bno\b.*\bthanks\b/i, /go away/i] },
  { cls: "ooo", patterns: [/out of office/i, /automatic reply/i, /on vacation/i, /limited email access/i, /\bOOO\b/] },
  { cls: "referral", patterns: [/not me/i, /reach out to/i, /better person/i, /forward(ed)? (this|you)/i, /handles this/i] },
  { cls: "not_now", patterns: [/circle back/i, /not (right )?now/i, /next (quarter|month|year)/i, /maybe later/i, /slammed/i, /busy/i] },
  { cls: "objection", patterns: [/tried .* before/i, /too expensive/i, /already (have|use)/i, /not (a )?(good )?fit/i, /skeptical/i, /robotic/i] },
  { cls: "question", patterns: [/\?/, /how (does|do|much|long)/i, /what (is|are|about|does)/i, /pricing/i, /can it/i, /do you/i] },
  { cls: "interested", patterns: [/interested/i, /tell me more/i, /sounds good/i, /let'?s (talk|chat)/i, /book/i, /demo/i, /timing/i] },
];

export function classifyByRules(body: string): Classification {
  for (const { cls, patterns } of RULES) {
    if (patterns.some((p) => p.test(body))) {
      return { classification: cls, confidence: 0.7, source: "rules" };
    }
  }
  return { classification: "question", confidence: 0.4, source: "rules" };
}

export async function classifyReply(body: string): Promise<Classification> {
  if (!aiAvailable()) return classifyByRules(body);
  try {
    const out = await complete({
      system: `Classify a single inbound reply to a cold sales email into exactly one bucket. Buckets: ${REPLY_CLASSES.join(", ")}.\n- interested: wants to learn more / move forward.\n- question: asks something but not yet committed.\n- objection: pushback (tried before, price, fit, skepticism).\n- not_now: timing, defer.\n- negative: clear no.\n- unsubscribe: asks to be removed.\n- ooo: auto-reply / out of office.\n- referral: points to someone else.\nReturn ONLY compact JSON: {"classification":"<bucket>","confidence":<0..1>}`,
      user: body,
      maxTokens: 80,
      temperature: 0,
      fast: true, // highest-frequency AI call (every reply, every 10 min) — keep it off the premium tier
      purpose: "classification",
    });
    const parsed = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? out);
    const cls = REPLY_CLASSES.includes(parsed.classification) ? parsed.classification : "question";
    return { classification: cls, confidence: Number(parsed.confidence) || 0.6, source: "ai" };
  } catch {
    return classifyByRules(body);
  }
}
