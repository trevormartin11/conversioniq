/**
 * Cross-campaign learnings — the memory the copy engine carries from one
 * campaign to the next. Before any results exist it returns the ConversionIQ
 * playbook (a sane starting knowledge base); once sends accumulate it derives
 * what's actually working from positive/negative outcomes.
 */
import type { ReplyClass, SequenceVariant } from "@/lib/data/types";
import { rate } from "@/lib/format";

export interface Learning {
  theme: string;
  insight: string;
  evidence: string;
  tone: "win" | "watch" | "seed";
}

/** Starting playbook — shown until real results refine it. */
const PLAYBOOK: Learning[] = [
  { theme: "Subject lines", insight: "Short, lowercase, specific subjects (“quick question”) beat clever or salesy ones.", evidence: "Playbook — refines as open data arrives", tone: "seed" },
  { theme: "Angle", insight: "Lead with the prospect's missed after-hours revenue, not our features.", evidence: "Playbook", tone: "seed" },
  { theme: "CTA", insight: "One ask per email — a 15-minute demo — phrased as a question.", evidence: "Playbook", tone: "seed" },
  { theme: "Follow-ups", insight: "Each follow-up adds a new angle (proof, objection, urgency), never “just bumping this.”", evidence: "Playbook", tone: "seed" },
  { theme: "Objections", insight: "Name the obvious objection (“won't it sound like a robot?”) and disarm it head-on.", evidence: "Playbook", tone: "seed" },
];

const MIN_SENDS = 20; // don't draw conclusions from thin samples

export function deriveLearnings(variants: SequenceVariant[], replyClasses: ReplyClass[]): Learning[] {
  const totalSent = variants.reduce((s, v) => s + v.sent, 0);
  if (totalSent === 0) return PLAYBOOK;

  const out: Learning[] = [];
  const sizable = variants.filter((v) => v.sent >= MIN_SENDS);

  // What converts: best vs worst on positive-reply rate.
  const ranked = [...sizable].sort((a, b) => rate(b.positives, b.sent) - rate(a.positives, a.sent));
  if (ranked.length >= 2) {
    const w = ranked[0];
    const l = ranked[ranked.length - 1];
    if (w.id !== l.id) {
      out.push({
        theme: "What converts",
        insight: `“${w.subject}” pulls ${(rate(w.positives, w.sent) * 100).toFixed(1)}% positive vs “${l.subject}” at ${(rate(l.positives, l.sent) * 100).toFixed(1)}%. Lean into the winner's framing on the next campaign.`,
        evidence: `${w.sent + l.sent} sends`,
        tone: "win",
      });
    }
  }

  // Which step earns the positives — informs where to invest copy effort.
  const byStep = new Map<number, { positives: number; sent: number }>();
  for (const v of variants) {
    const acc = byStep.get(v.step) ?? { positives: 0, sent: 0 };
    acc.positives += v.positives;
    acc.sent += v.sent;
    byStep.set(v.step, acc);
  }
  const bestStep = [...byStep.entries()].filter(([, a]) => a.sent >= MIN_SENDS).sort((a, b) => rate(b[1].positives, b[1].sent) - rate(a[1].positives, a[1].sent))[0];
  if (bestStep) {
    out.push({
      theme: "Cadence",
      insight: `Step ${bestStep[0]} produces the most positive replies — keep that beat and mirror its angle in new sequences.`,
      evidence: `${bestStep[1].sent} sends at step ${bestStep[0]}`,
      tone: "win",
    });
  }

  // Reply themes: are objections drowning out interest?
  if (replyClasses.length >= 5) {
    const n = replyClasses.length;
    const share = (c: ReplyClass) => replyClasses.filter((x) => x === c).length / n;
    const objections = share("objection") + share("negative");
    const interested = share("interested") + share("question");
    if (objections > interested && objections > 0.3) {
      out.push({
        theme: "Objections",
        insight: `Objections/negatives (${(objections * 100).toFixed(0)}%) are outpacing interest (${(interested * 100).toFixed(0)}%). Pre-empt the top objection earlier in the sequence.`,
        evidence: `${n} classified replies`,
        tone: "watch",
      });
    } else if (interested > 0.2) {
      out.push({
        theme: "Resonance",
        insight: `Interest/questions are running at ${(interested * 100).toFixed(0)}% of replies — the core angle is landing. Reuse it for adjacent verticals.`,
        evidence: `${n} classified replies`,
        tone: "win",
      });
    }
  }

  // Low openers worth a subject rewrite.
  const lowOpen = sizable.filter((v) => rate(v.opens, v.sent) < 0.4);
  if (lowOpen.length) {
    out.push({
      theme: "Subject lines",
      insight: `${lowOpen.length} variant${lowOpen.length === 1 ? "" : "s"} open below 40% — those subjects ("${lowOpen[0].subject}") need a specific-pain rewrite.`,
      evidence: `${lowOpen.reduce((s, v) => s + v.sent, 0)} sends`,
      tone: "watch",
    });
  }

  return out.length ? out : PLAYBOOK;
}
