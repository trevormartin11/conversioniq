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

/**
 * Map one campaign's step-analytics rows to hub variant ids (`sv_<instId>_<step0>_<v0>`).
 * Tolerant of field-name drift across Instantly responses; rows that can't be located
 * (no step, no variant) are skipped rather than guessed.
 */
export function mapStepAnalytics(instantlyCampaignId: string, rows: Record<string, unknown>[]): VariantCounters[] {
  const out: VariantCounters[] = [];
  for (const r of rows) {
    const stepRaw = n(r.step ?? r.sequence_step ?? r.step_number);
    if (stepRaw < 1) continue; // Instantly steps are 1-based; 0/absent means unmappable
    const vIdx = variantIndex(r.variant ?? r.variant_index ?? r.step_variant);
    if (vIdx === null) continue;
    out.push({
      id: `sv_${instantlyCampaignId}_${stepRaw - 1}_${vIdx}`,
      sent: n(r.sent ?? r.emails_sent_count ?? r.contacted),
      opens: n(r.opened ?? r.open_count ?? r.opens),
      replies: n(r.replies ?? r.reply_count ?? r.replied),
    });
  }
  return out;
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
    for (const m of mapStepAnalytics(c.instantly_campaign_id, rows)) {
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
