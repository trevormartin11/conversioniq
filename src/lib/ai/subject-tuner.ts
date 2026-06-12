/**
 * Subject-line tuner — the self-learning loop for copy. Once the variant-metrics sync fills
 * the A/B counters, this runs daily: for each live campaign step with two subject variants,
 * decide whether one has PROVEN better (minimum sample + a real statistical lead, not noise),
 * then act according to the automation dial:
 *   - approve_all  → recommend only (Telegram + audit) — the operator promotes by hand;
 *   - auto_safe/auto_all → promote the winner in place, draft a fresh AI challenger subject
 *     into the losing slot, push the sequence to Instantly, and say exactly what changed.
 * SUBJECTS ONLY — bodies stay human-owned. Counter baselines are snapshotted in the audit
 * log at each promotion so cumulative Instantly counters don't poison the next comparison.
 */
import { getAudit, getAutomationLevel, getCampaigns, getVariants, pushAudit, updateVariant } from "@/lib/data/store";
import { updateInstantlyCampaignSequence } from "@/lib/integrations/instantly";
import { sendTelegram, tgEscape } from "@/lib/integrations/telegram";
import { rewriteCopy } from "@/lib/ai/copy";
import { integrations } from "@/lib/config";
import type { SequenceVariant } from "@/lib/data/types";

/** Each arm needs this many sends before a verdict — below it, differences are noise. */
export const MIN_SENDS_PER_ARM = 100;
/** One-sided z threshold ≈ 95% confidence on the open-rate difference. */
const Z_THRESHOLD = 1.64;

export interface ArmStats {
  sends: number;
  opens: number;
}

export interface Verdict {
  winner: 0 | 1;
  winnerRate: number;
  loserRate: number;
  z: number;
}

/** Two-proportion z-test on open rate (subjects drive opens). Null = keep testing. */
export function pickWinner(a: ArmStats, b: ArmStats): Verdict | null {
  if (a.sends < MIN_SENDS_PER_ARM || b.sends < MIN_SENDS_PER_ARM) return null;
  const pa = a.opens / a.sends;
  const pb = b.opens / b.sends;
  if (pa === pb) return null;
  const pooled = (a.opens + b.opens) / (a.sends + b.sends);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.sends + 1 / b.sends));
  if (!Number.isFinite(se) || se === 0) return null;
  const z = Math.abs(pa - pb) / se;
  if (z < Z_THRESHOLD) return null;
  const winner = pa > pb ? 0 : 1;
  return { winner, winnerRate: winner === 0 ? pa : pb, loserRate: winner === 0 ? pb : pa, z };
}

/** Counters net of the last promotion's snapshot — Instantly counters are cumulative, so a
 *  promoted slot's history must not count against its fresh challenger. */
export function netStats(v: Pick<SequenceVariant, "sent" | "opens">, baseline?: { sent: number; opens: number }): ArmStats {
  return {
    sends: Math.max(0, v.sent - (baseline?.sent ?? 0)),
    opens: Math.max(0, v.opens - (baseline?.opens ?? 0)),
  };
}

const pctFmt = (r: number) => `${(r * 100).toFixed(1)}%`;

interface PromotionMeta {
  step?: number;
  baselines?: Record<string, { sent: number; opens: number }>;
  winner?: string;
}

export async function runSubjectTuner(): Promise<{ examined: number; promoted: number; recommended: number }> {
  const level = getAutomationLevel();
  const audit = getAudit();
  let examined = 0;
  let promoted = 0;
  let recommended = 0;

  for (const c of getCampaigns().filter((x) => x.instantlyCampaignId && x.status === "active")) {
    const vars = getVariants().filter((v) => v.campaignId === c.id).sort((a, b) => a.step - b.step || a.variant.localeCompare(b.variant));
    const steps = [...new Set(vars.map((v) => v.step))].sort((a, b) => a - b);

    for (const step of steps) {
      const pair = vars.filter((v) => v.step === step);
      if (pair.length !== 2) continue; // tuner only judges clean A/B pairs
      examined++;

      // Baselines + recommendation dedupe from the audit trail for this campaign+step.
      const history = audit.filter((a) => a.entity === "campaign_step" && a.entityId === `${c.id}:${step}`);
      const lastPromotion = history.find((a) => a.action === "copy.promoted");
      const baselines = (lastPromotion?.meta as PromotionMeta | undefined)?.baselines ?? {};
      const verdict = pickWinner(netStats(pair[0], baselines[pair[0].id]), netStats(pair[1], baselines[pair[1].id]));
      if (!verdict) continue;

      const winner = pair[verdict.winner];
      const loser = pair[1 - verdict.winner];
      const summary = `“${winner.subject}” is beating “${loser.subject}” — ${pctFmt(verdict.winnerRate)} vs ${pctFmt(verdict.loserRate)} opens (z=${verdict.z.toFixed(2)}) on ${c.name} step ${step}`;

      if (level === "approve_all") {
        // Recommend once per winner (re-ping only if the winning subject changes).
        const already = history.find((a) => a.action === "copy.winner_found" && (a.meta as PromotionMeta).winner === winner.subject);
        if (already) continue;
        await pushAudit("system", "copy.winner_found", "campaign_step", `${c.id}:${step}`, { winner: winner.subject, loser: loser.subject, step, z: verdict.z });
        await sendTelegram(`📈 Subject test has a winner: ${tgEscape(summary)}. Automation is set to Approve-all, so promote it from the campaign page (or raise the automation level and the tuner will handle these).`);
        recommended++;
        continue;
      }

      // AUTO MODE — promote in place: keep the winner, draft a fresh challenger into the
      // losing slot (or consolidate on the winner when no AI is available).
      let challenger = winner.subject;
      if (integrations.anthropic) {
        const alt = await rewriteCopy({
          subject: winner.subject,
          body: winner.body,
          instruction: `Write ONLY a new subject line to challenge the current winner ("${winner.subject}") in an A/B test. A genuinely different angle — not a paraphrase. Short and lowercase.`,
        });
        if (alt.source === "ai" && alt.subject.trim() && alt.subject.trim().toLowerCase() !== winner.subject.trim().toLowerCase()) {
          challenger = alt.subject.trim();
        }
      }
      await updateVariant(loser.id, { subject: challenger }, "subject-tuner");

      // Push the full sequence so Instantly sends the new pairing.
      const byStep = new Map<number, { subject: string; body: string }[]>();
      for (const v of getVariants().filter((x) => x.campaignId === c.id).sort((a, b) => a.step - b.step || a.variant.localeCompare(b.variant))) {
        const arr = byStep.get(v.step) ?? [];
        arr.push({ subject: v.subject, body: v.body });
        byStep.set(v.step, arr);
      }
      const stepsVariants = [...byStep.keys()].sort((a, b) => a - b).map((k) => byStep.get(k)!);
      await updateInstantlyCampaignSequence(c.instantlyCampaignId!, stepsVariants);

      // Snapshot cumulative counters as the new baseline for BOTH slots.
      await pushAudit("subject-tuner", "copy.promoted", "campaign_step", `${c.id}:${step}`, {
        step,
        winner: winner.subject,
        retired: loser.subject,
        challenger: challenger === winner.subject ? null : challenger,
        z: verdict.z,
        baselines: {
          [winner.id]: { sent: winner.sent, opens: winner.opens },
          [loser.id]: { sent: loser.sent, opens: loser.opens },
        },
      });
      await sendTelegram(
        `🤖 Subject promoted on ${tgEscape(c.name)} step ${step}: kept “${tgEscape(winner.subject)}” (${pctFmt(verdict.winnerRate)} opens), retired “${tgEscape(loser.subject)}” (${pctFmt(verdict.loserRate)})${challenger !== winner.subject ? `, new challenger: “${tgEscape(challenger)}”` : " — no AI key, so the winner now runs solo"}.`,
      );
      promoted++;
    }
  }
  return { examined, promoted, recommended };
}
