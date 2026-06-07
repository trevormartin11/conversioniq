/**
 * Channel message drafting — short, personalized SMS texts and social DMs.
 * AI when a Claude key is present; a sensible templated fallback otherwise (so the
 * lane is fully usable in mock/no-key mode). Same shape as copy.ts.
 */
import { aiAvailable, complete } from "@/lib/integrations/anthropic";
import { voiceSystemPrompt } from "./voice";
import type { OutreachChannel } from "@/lib/data/types";

export interface ChannelDraft {
  body: string;
  rationale: string | null;
  source: "ai" | "rules";
}

export interface DraftContext {
  channel: OutreachChannel;
  firstName: string;
  company: string;
  title?: string;
  vertical?: string;
  angle?: string; // the pain/problem to lead with
  signal?: string; // a personalization hook (recent post/expansion) — social especially
}

function rulesDraft(ctx: DraftContext): ChannelDraft {
  const fn = ctx.firstName?.trim() || "there";
  const co = ctx.company?.trim() || "your team";
  if (ctx.channel === "sms") {
    return {
      body: `Hi ${fn}, it's Trevor at ConversionIQ — thanks for the reply earlier! Our AI answers the leads ${co} misses after hours and books them in seconds. Open to a quick 15-min look this week? Reply STOP to opt out.`,
      rationale: "Consent-first SMS: names the sender, references prior interest, one soft CTA, opt-out included.",
      source: "rules",
    };
  }
  const opener = ctx.signal?.trim() ? `Saw ${ctx.signal.trim()} — ` : "";
  return {
    body: `${opener}hey ${fn}, quick one: when a lead messages ${co} after you've closed, who answers? Most ${ctx.vertical || "teams"} lose those to whoever replies first. We put an AI on it that responds in seconds and books the appointment. Open to a quick look?`,
    rationale: "Personalized DM: a real opener, the after-hours pain, one soft CTA — written to be sent at human pace.",
    source: "rules",
  };
}

export async function draftChannelMessage(ctx: DraftContext): Promise<ChannelDraft> {
  if (!aiAvailable()) return rulesDraft(ctx);
  try {
    const isSms = ctx.channel === "sms";
    const out = await complete({
      system: voiceSystemPrompt(),
      user: [
        `Write a single ${isSms ? "SMS text message" : `${ctx.channel} direct message`} from ConversionIQ — an AI that instantly answers a business's inbound/after-hours leads and books them into the calendar.`,
        `Recipient: ${ctx.firstName || "(unknown)"}${ctx.title ? `, ${ctx.title}` : ""} at ${ctx.company || "their business"}${ctx.vertical ? ` (${ctx.vertical})` : ""}.`,
        ctx.angle ? `Lead with this pain/angle: ${ctx.angle}.` : "",
        ctx.signal ? `Open with a specific personalized line using this real signal: ${ctx.signal}.` : "",
        isSms
          ? `Rules: under 300 characters; this contact has OPTED IN, so reference prior interest; identify the sender by name; exactly one soft CTA (a 15-minute look) phrased as a question; plain text, no links; end with "Reply STOP to opt out".`
          : `Rules: conversational and human, 2-4 short sentences; open with a specific personalized line (never "Hope you're well"); name the after-hours/missed-lead pain; exactly one soft CTA as a question; no links, no email signature.`,
        `Return ONLY compact JSON: {"body":"...","rationale":"one line on why this works"}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      maxTokens: 500,
      temperature: 0.6,
      purpose: "channel",
    });
    const parsed = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? out) as { body?: string; rationale?: string };
    if (!parsed.body?.trim()) throw new Error("empty generation");
    let body = parsed.body.trim();
    // Compliance guard: an SMS must always carry an opt-out, even if the model omits it.
    if (isSms && !/\bstop\b/i.test(body)) body += " Reply STOP to opt out.";
    return { body, rationale: parsed.rationale?.trim() ?? null, source: "ai" };
  } catch {
    return rulesDraft(ctx);
  }
}
