/**
 * Per-variant analytics sync — the data pipe for subject A/B learning. Until this existed the
 * sequence_variants counters stayed at zero forever, so nothing in the system could tell which
 * subject line was winning. Pulls Instantly's per-step/per-variant counters for every live
 * campaign and UPDATEs the matching hub variants (update-only: a missing/empty analytics
 * response must never zero real history).
 */
import { getCampaignStepAnalytics } from "@/lib/integrations/instantly";
import { supabaseAdmin } from "@/lib/data/supabase";

const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export interface VariantCounters {
  id: string;
  sent: number;
  opens: number;
  replies: number;
}

/** Letter or index → 0-based variant index ("A"/"a"/0 → 0, "B"/1 → 1). Null if unparseable. */
export function variantIndex(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (/^\d+$/.test(t)) return Number(t);
    if (/^[a-z]$/i.test(t)) return t.toUpperCase().charCodeAt(0) - 65;
  }
  return null;
}

/** Strict 0-based index parse for the step field: integer ≥ 0 or a digit string. Letters are
 *  not steps; absent/garbage is null (the old `Number(v) || 0` turned BOTH "absent" and
 *  malformed into step 0, indistinguishable from a real first-step row). */
export function stepIndex(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

/**
 * Map one campaign's step-analytics rows to hub variant ids (`sv_<instId>_<step0>_<v0>`).
 *
 * LIVE-VERIFIED (2026-06-13, real send): /campaigns/analytics/steps returns ZERO-based
 * `step` and `variant` as digit strings — `{"step":"0","variant":"0","sent":1}` for the
 * first sequence position — matching the sv_ id convention with NO offset. The previous
 * 1-based assumption dropped every step-"0" row silently, so the first step's counters
 * (where the A/B subject experiment lives) never synced while `unmatched` stayed 0.
 * Rows with an unparseable step/variant are returned in `dropped` so the cron's health
 * counter surfaces shape drift instead of hiding it.
 */
export function mapStepAnalytics(instantlyCampaignId: string, rows: Record<string, unknown>[]): { counters: VariantCounters[]; dropped: number } {
  const counters: VariantCounters[] = [];
  let dropped = 0;
  for (const r of rows) {
    const step = stepIndex(r.step ?? r.sequence_step ?? r.step_number);
    const vIdx = variantIndex(r.variant ?? r.variant_index ?? r.step_variant);
    if (step === null || vIdx === null) {
      dropped++;
      continue;
    }
    counters.push({
      id: `sv_${instantlyCampaignId}_${step}_${vIdx}`,
      sent: n(r.sent ?? r.emails_sent_count ?? r.contacted),
      opens: n(r.opened ?? r.open_count ?? r.opens),
      replies: n(r.replies ?? r.reply_count ?? r.replied),
    });
  }
  return { counters, dropped };
}

export async function syncVariantMetrics() {
  const db = supabaseAdmin();
  const { data: camps, error } = await db.from("campaigns").select("id, instantly_campaign_id").not("instantly_campaign_id", "is", null);
  if (error) throw new Error(`variant metrics: campaigns read failed: ${error.message}`);
  const { data: vars, error: vErr } = await db.from("sequence_variants").select("id");
  if (vErr) throw new Error(`variant metrics: variants read failed: ${vErr.message}`);
  const known = new Set((vars ?? []).map((v: { id: string }) => v.id));

  let updated = 0;
  let unmatched = 0; // analytics rows that didn't resolve to a hub variant id — a high count
  // means the step/variant numbering assumptions have drifted (visible in the cron result).
  for (const c of (camps ?? []) as { id: string; instantly_campaign_id: string }[]) {
    const rows = await getCampaignStepAnalytics(c.instantly_campaign_id);
    if (!rows.length) continue;
    const { counters, dropped } = mapStepAnalytics(c.instantly_campaign_id, rows);
    unmatched += dropped;
    for (const m of counters) {
      if (!known.has(m.id)) {
        unmatched++;
        continue;
      }
      const { error: uErr } = await db.from("sequence_variants").update({ sent: m.sent, opens: m.opens, replies: m.replies }).eq("id", m.id);
      if (uErr) throw new Error(`variant metrics: update failed for ${m.id}: ${uErr.message}`);
      updated++;
    }
  }
  return { variants: updated, unmatched };
}
