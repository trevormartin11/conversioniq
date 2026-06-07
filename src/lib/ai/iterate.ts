/**
 * Auto-iteration — turn live campaign results into prioritized next moves
 * (scale a winner, kill a loser, test a new angle). Human-in-the-loop: it
 * recommends, the operator applies. Rules-based always; AI sharpens it when keyed.
 */
import { rate } from "@/lib/format";
import { aiAvailable, complete } from "@/lib/integrations/anthropic";
import { voiceSystemPrompt } from "./voice";
import type { Campaign, Reply, SequenceVariant } from "@/lib/data/types";

export interface NextMove {
  kind: "scale" | "kill" | "test" | "fix" | "info";
  title: string;
  detail: string;
  source: "ai" | "rules";
}

export function ruleMoves(campaigns: Campaign[], variants: SequenceVariant[], replies: Reply[]): NextMove[] {
  const totalSent = variants.reduce((s, v) => s + v.sent, 0);
  if (totalSent === 0) {
    return [{ kind: "info", title: "No send data yet", detail: "Launch a campaign — once emails go out, this becomes specific scale / kill / test moves from live results.", source: "rules" }];
  }
  const moves: NextMove[] = [];
  const cname = (id: string) => campaigns.find((c) => c.id === id)?.name ?? id;

  const byCampaign = new Map<string, { sent: number; positives: number; name: string }>();
  for (const v of variants) {
    const acc = byCampaign.get(v.campaignId) ?? { sent: 0, positives: 0, name: cname(v.campaignId) };
    acc.sent += v.sent;
    acc.positives += v.positives;
    byCampaign.set(v.campaignId, acc);
  }
  const ranked = [...byCampaign.values()].filter((c) => c.sent >= 50).sort((a, b) => rate(b.positives, b.sent) - rate(a.positives, a.sent));
  if (ranked[0]) {
    moves.push({ kind: "scale", title: `Scale ${ranked[0].name}`, detail: `Best positive-reply rate at ${(rate(ranked[0].positives, ranked[0].sent) * 100).toFixed(1)}% over ${ranked[0].sent} sends — add inboxes/volume here.`, source: "rules" });
  }
  if (ranked.length > 1) {
    const w = ranked[ranked.length - 1];
    if (rate(w.positives, w.sent) < rate(ranked[0].positives, ranked[0].sent) / 2) {
      moves.push({ kind: "kill", title: `Rework ${w.name}`, detail: `Half the positive rate of your best (${(rate(w.positives, w.sent) * 100).toFixed(1)}%) — pause or rewrite before adding volume.`, source: "rules" });
    }
  }
  const sizable = variants.filter((v) => v.sent >= 30);
  if (sizable.length > 1) {
    const worst = [...sizable].sort((a, b) => rate(a.positives, a.sent) - rate(b.positives, b.sent))[0];
    moves.push({ kind: "kill", title: `Retire step ${worst.step} variant ${worst.variant}`, detail: `Lowest positive rate (${(rate(worst.positives, worst.sent) * 100).toFixed(1)}%) — swap in a fresh variant.`, source: "rules" });
  }
  const lowOpen = sizable.filter((v) => rate(v.opens, v.sent) < 0.4).sort((a, b) => rate(a.opens, a.sent) - rate(b.opens, b.sent))[0];
  if (lowOpen) {
    moves.push({ kind: "test", title: `Test a new subject on step ${lowOpen.step}`, detail: `"${lowOpen.subject}" opens at ${(rate(lowOpen.opens, lowOpen.sent) * 100).toFixed(0)}% — try a shorter, more specific line.`, source: "rules" });
  }
  if (replies.length >= 8) {
    const obj = replies.filter((r) => r.classification === "objection" || r.classification === "negative").length / replies.length;
    if (obj > 0.35) moves.push({ kind: "fix", title: "Preempt the top objection", detail: `${(obj * 100).toFixed(0)}% of replies are objections/negatives — address it earlier in the sequence.`, source: "rules" });
  }
  return moves.length ? moves : [{ kind: "info", title: "Holding steady", detail: "No outlier moves yet — keep gathering data.", source: "rules" }];
}

export async function nextMoves(campaigns: Campaign[], variants: SequenceVariant[], replies: Reply[]): Promise<NextMove[]> {
  const rules = ruleMoves(campaigns, variants, replies);
  const totalSent = variants.reduce((s, v) => s + v.sent, 0);
  if (!aiAvailable() || totalSent === 0) return rules;
  try {
    const cname = (id: string) => campaigns.find((c) => c.id === id)?.name ?? id;
    const stats = variants
      .filter((v) => v.sent > 0)
      .map((v) => `${cname(v.campaignId)} · step ${v.step}${v.variant} · subject="${v.subject}" sent=${v.sent} open=${(rate(v.opens, v.sent) * 100).toFixed(0)}% reply=${(rate(v.replies, v.sent) * 100).toFixed(1)}% pos=${(rate(v.positives, v.sent) * 100).toFixed(1)}%`)
      .join("\n");
    const classes: Record<string, number> = {};
    for (const r of replies) classes[r.classification] = (classes[r.classification] ?? 0) + 1;
    const out = await complete({
      system: voiceSystemPrompt(),
      user: [
        "You run a cold-email operation reselling ConversionIQ. From the live results below, give 3-5 prioritized next moves — each is a scale (add volume), kill (retire/rework), test (new variant/subject), or fix (sequence change). Be specific and reference the data.",
        `Variant results:\n${stats}`,
        `Reply classes: ${JSON.stringify(classes)}`,
        `Return ONLY JSON: [{"kind":"scale|kill|test|fix","title":"...","detail":"..."}]`,
      ].join("\n\n"),
      maxTokens: 900,
      purpose: "next_moves",
    });
    const parsed = JSON.parse(out.match(/\[[\s\S]*\]/)?.[0] ?? out) as { kind: NextMove["kind"]; title: string; detail: string }[];
    const moves = parsed.filter((m) => m.title).map((m) => ({ ...m, source: "ai" as const }));
    return moves.length ? moves : rules;
  } catch {
    return rules;
  }
}
