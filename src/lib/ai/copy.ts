/** Copy coach — analyze variant results and suggest improvements / A-B ideas. */
import { aiAvailable, complete } from "@/lib/integrations/anthropic";
import { voiceSystemPrompt } from "./voice";
import { rate } from "@/lib/format";
import type { SequenceVariant } from "@/lib/data/types";

export interface CopySuggestion {
  title: string;
  detail: string;
  source: "ai" | "rules";
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
