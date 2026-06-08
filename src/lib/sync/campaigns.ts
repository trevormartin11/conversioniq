/** Sync Instantly campaigns + their sequences into the hub DB. */
import { listAllCampaigns } from "@/lib/integrations/instantly";
import { chunkedUpsert, supabaseAdmin } from "@/lib/data/supabase";
import { stripHtml } from "@/lib/utils";

function personaFor(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("trevor")) return "pe_trevor";
  if (n.includes("jon")) return "pe_jon";
  if (n.includes("brian")) return "pe_brian";
  return null;
}
function verticalFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("med spa") || n.includes("medspa")) return "Med Spa";
  if (n.includes("home service")) return "Home Services";
  if (n.includes("dental")) return "Dental";
  if (n.includes("auto") || n.includes("dealership")) return "Automotive";
  if (n.includes("law") || n.includes("legal") || n.includes("attorney")) return "Legal";
  if (n.includes("e-commerce") || n.includes("ecommerce") || n.includes("dtc")) return "E-Commerce";
  if (n.includes("hospitality")) return "Hospitality";
  if (n.includes("political") || n.includes("pac")) return "Political";
  return "General";
}
function statusFor(s: number | undefined): string {
  return s === 1 ? "active" : s === 2 ? "paused" : s === 3 ? "completed" : "draft";
}
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").toLowerCase();

interface SeqStep { variants?: { subject?: string; body?: string }[] }
interface Seq { steps?: SeqStep[] }

export async function syncCampaigns() {
  const campaigns = await listAllCampaigns();
  const campRows: Record<string, unknown>[] = [];
  const variantRows: Record<string, unknown>[] = [];

  // Preserve the original created_at on re-sync — don't reset every campaign's age each run
  // (it skews the Staged-board ordering and any age-based logic).
  const { data: existingCamps } = await supabaseAdmin().from("campaigns").select("id, created_at");
  const createdAtById = new Map((existingCamps ?? []).map((r: { id: string; created_at: string }) => [r.id, r.created_at]));

  for (const c of campaigns) {
    if (!c.id) continue;
    const cid = `c_${c.id}`;
    campRows.push({
      id: cid, name: c.name ?? "(untitled)", vertical: verticalFor(c.name ?? ""),
      persona_id: personaFor(c.name ?? ""), status: statusFor(c.status),
      instantly_campaign_id: c.id, list_version: "instantly",
      inbox_ids: (c.email_list ?? []).map((e) => `ib_${slug(e)}`),
      daily_cap: c.daily_limit ?? 80, created_at: createdAtById.get(cid) ?? new Date().toISOString(),
    });
    const seqs = (c.sequences as Seq[]) ?? [];
    for (const seq of seqs) {
      (seq.steps ?? []).forEach((step, stepIdx) => {
        (step.variants ?? []).forEach((v, vIdx) => {
          variantRows.push({
            id: `sv_${c.id}_${stepIdx}_${vIdx}`, campaign_id: cid, step: stepIdx + 1,
            variant: String.fromCharCode(65 + vIdx), subject: v.subject ?? "",
            body: stripHtml(v.body ?? ""), sent: 0, opens: 0, replies: 0, positives: 0, approved: true,
          });
        });
      });
    }
  }

  const campaignsWritten = await chunkedUpsert("campaigns", campRows);
  const variantsWritten = variantRows.length ? await chunkedUpsert("sequence_variants", variantRows) : 0;

  // Reconcile deletions. The sync is the source of truth for genuinely Instantly-synced campaigns, so a
  // hub campaign that has an instantly_campaign_id no longer in the live list was deleted there — prune it
  // (and its variants) so deletions propagate. Scope strictly to rows WITH an instantly_campaign_id: that
  // leaves hub-native drafts AND clones (which inherit list_version='instantly' but have a null
  // instantly_campaign_id until launched) untouched — otherwise a fresh clone would be pruned on next sync.
  // Guard: only prune when the fetch actually returned campaigns, so a transient empty Instantly response
  // can never wipe the hub.
  const db = supabaseAdmin();
  let pruned = 0;
  if (campRows.length > 0) {
    const liveIds = new Set(campRows.map((r) => r.id as string));
    const { data: existing } = await db.from("campaigns").select("id").not("instantly_campaign_id", "is", null);
    const stale = (existing ?? []).map((r) => r.id as string).filter((id) => !liveIds.has(id));
    if (stale.length) {
      await db.from("sequence_variants").delete().in("campaign_id", stale);
      await db.from("campaigns").delete().in("id", stale);
      pruned = stale.length;
    }
    // Drop the legacy seeded placeholder once real campaigns are present.
    await db.from("sequence_variants").delete().eq("campaign_id", "c_medspa");
    await db.from("campaigns").delete().eq("id", "c_medspa");
  }

  return { campaigns: campaignsWritten, variants: variantsWritten, pruned };
}
