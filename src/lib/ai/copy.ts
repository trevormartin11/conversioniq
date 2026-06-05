/** Copy coach — analyze variant results and suggest improvements / A-B ideas. */
import { aiAvailable, complete } from "@/lib/integrations/anthropic";
import { voiceSystemPrompt } from "./voice";
import { rate } from "@/lib/format";
import type { SequenceVariant } from "@/lib/data/types";
import type { Learning } from "./learnings";

export interface CopySuggestion {
  title: string;
  detail: string;
  source: "ai" | "rules";
}

export interface GeneratedStep {
  step: number;
  subject: string;
  body: string;
  rationale?: string;
}

function rulesSuggestions(variants: SequenceVariant[]): CopySuggestion[] {
  const out: CopySuggestion[] = [];
  const ranked = [...variants].sort((a, b) => rate(b.positives, b.sent) - rate(a.positives, a.sent));
  const winner = ranked[0];
  const loser = ranked[ranked.length - 1];
  if (winner && loser && winner.id !== loser.id) {
    out.push({
      title: `Variant ${winner.variant} is winning on positive-reply rate`,
      detail: `Variant ${winner.variant} converts at ${(rate(winner.positives, winner.sent) * 100).toFixed(1)}% positive vs ${(rate(loser.positives, loser.sent) * 100).toFixed(1)}% for ${loser.variant}. Consider shifting more volume to ${winner.variant} and retiring ${loser.variant}.`,
      source: "rules",
    });
  }
  for (const v of variants) {
    const openRate = rate(v.opens, v.sent);
    if (openRate < 0.5) {
      out.push({ title: `Low open rate on variant ${v.variant} (${(openRate * 100).toFixed(0)}%)`, detail: `Subject line "${v.subject}" may be under-performing. Test a shorter, more specific subject that names the pain (missed after-hours leads).`, source: "rules" });
    }
  }
  out.push({ title: "Suggested A/B test", detail: "Test a curiosity subject vs. a direct-value subject, holding body constant, to isolate subject-line lift.", source: "rules" });
  return out;
}

export async function suggestCopy(variants: SequenceVariant[]): Promise<CopySuggestion[]> {
  if (!aiAvailable()) return rulesSuggestions(variants);
  try {
    const stats = variants
      .map((v) => `Variant ${v.variant} (step ${v.step}): subject="${v.subject}" sent=${v.sent} opens=${v.opens} replies=${v.replies} positives=${v.positives}`)
      .join("\n");
    const out = await complete({
      system: voiceSystemPrompt(),
      user: [
        "You are a cold-email copy coach for a team reselling ConversionIQ. Given the variant results below, return 3-4 concrete, data-driven suggestions to improve positive-reply rate, plus one specific A/B test to run next.",
        stats,
        `Return ONLY compact JSON array: [{"title":"...","detail":"..."}]`,
      ].join("\n\n"),
      maxTokens: 700,
      temperature: 0.5,
    });
    const parsed = JSON.parse(out.match(/\[[\s\S]*\]/)?.[0] ?? out);
    return (parsed as { title: string; detail: string }[]).map((s) => ({ ...s, source: "ai" as const }));
  } catch {
    return rulesSuggestions(variants);
  }
}

// --- sequence generation: the flywheel payoff ------------------------------
// Draft a fresh sequence for a new campaign, applying what prior campaigns
// taught us (the learnings). AI when a Claude key is present; templated otherwise.

function rulesSequence(vertical: string): GeneratedStep[] {
  const v = vertical || "your";
  return [
    { step: 1, subject: "quick question", body: `{{firstName}}, when a lead messages {{companyName}} after hours, who answers?\n\nMost ${v} businesses lose those to whoever replies first. We put an AI on it that responds in seconds and books the appointment — 24/7.\n\nWorth a quick look? Open to a 15-min demo this week?`, rationale: "Opens with the missed-revenue pain + a single soft CTA." },
    { step: 2, subject: "re: quick question", body: `{{firstName}}, following up — the gap is usually nights and weekends, when staff are gone but buyers are still browsing.\n\nOur AI handles those inquiries instantly so {{companyName}} isn't leaving booked revenue on the table.\n\nCan I grab 15 minutes to show you?`, rationale: "New angle (after-hours timing), not a bump." },
    { step: 3, subject: "the math", body: `{{firstName}}, even a handful of missed after-hours leads a week adds up fast for {{companyName}}.\n\nThe AI pays for itself on the first recovered booking. Happy to show the numbers on a quick call.\n\nWhat does your calendar look like Thursday?`, rationale: "Quantifies the value; concrete CTA." },
    { step: 4, subject: "should I close this out?", body: `{{firstName}}, haven't heard back so I'll assume the timing's off.\n\nIf recovering missed leads ever moves up the list for {{companyName}}, just reply and I'll send a 2-minute video.\n\nNo hard feelings either way.`, rationale: "Breakup email — low-pressure, keeps the door open." },
  ];
}

export async function generateSequence(
  vertical: string,
  learnings: Pick<Learning, "theme" | "insight">[],
): Promise<{ steps: GeneratedStep[]; source: "ai" | "rules" }> {
  if (!aiAvailable()) return { steps: rulesSequence(vertical), source: "rules" };
  try {
    const learningText = learnings.map((l) => `- [${l.theme}] ${l.insight}`).join("\n");
    const out = await complete({
      system: voiceSystemPrompt(),
      user: [
        `Draft a 4-step cold-email sequence for a "${vertical}" outbound campaign selling ConversionIQ — an AI that instantly answers a business's inbound/after-hours leads and books them into the calendar.`,
        `Apply these learnings from prior campaigns:\n${learningText || "(no results yet — use the playbook defaults)"}`,
        `Rules: short lowercase subject lines; lead with the prospect's missed revenue, not features; exactly one CTA per email (a 15-minute demo) phrased as a question; every follow-up adds a NEW angle (timing, math, proof, breakup) — never "just bumping"; bodies under 90 words; use {{firstName}} and {{companyName}} merge tags.`,
        `Return ONLY compact JSON: {"steps":[{"step":1,"subject":"...","body":"...","rationale":"why this works"}]}`,
      ].join("\n\n"),
      maxTokens: 1600,
      temperature: 0.6,
    });
    const parsed = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? out) as { steps?: GeneratedStep[] };
    const steps = (parsed.steps ?? []).map((s, i) => ({ step: s.step ?? i + 1, subject: s.subject ?? "", body: s.body ?? "", rationale: s.rationale }));
    if (!steps.length) throw new Error("empty generation");
    return { steps, source: "ai" };
  } catch {
    return { steps: rulesSequence(vertical), source: "rules" };
  }
}
