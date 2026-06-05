import type { DemoLostReason } from "@/lib/data/types";

/**
 * Best-effort map of a free-text loss reason (as typed in CIQ's Zoho by whoever ran
 * the demo) onto our structured taxonomy, so the learning loop can aggregate it. The
 * raw text is preserved separately as the note.
 */
export function mapLostReason(raw?: string | null): { reason: DemoLostReason; note: string | null } {
  const r = (raw ?? "").toLowerCase().trim();
  if (!r) return { reason: "other", note: null };
  const reason: DemoLostReason =
    /budget|price|pricing|cost|expensive|afford/.test(r) ? "no_budget"
    : /competitor|alternative|already (use|have)|switch|incumbent/.test(r) ? "competitor"
    : /timing|later|next (quarter|year|month)|not now|too early|revisit/.test(r) ? "bad_timing"
    : /icp|fit|too small|too big|wrong|not a fit|size/.test(r) ? "not_icp"
    : /no.?show|didn'?t show|missed|stood up/.test(r) ? "no_show"
    : /not interested|no interest|not keen/.test(r) ? "not_interested"
    : /decision|stalled|ghost|no response|went (dark|quiet)|unrespons/.test(r) ? "no_decision"
    : "other";
  return { reason, note: raw ?? null };
}
