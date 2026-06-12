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
  const syncStart = new Date().toISOString();
  const campaigns = await listAllCampaigns();

  // Existing rows: preserve created_at on re-sync, and split insert vs update payloads so
  // hub-owned attribution survives — the old single upsert re-derived vertical/persona from
  // NAME KEYWORDS on every run (a pushed draft's authored "Med Spa" became "General") and
  // zeroed every variant's sent/opens/replies/positives counters.
  const db = supabaseAdmin();
  const { data: existingCamps, error: exErr } = await db.from("campaigns").select("id, created_at, vertical, persona_id");
  if (exErr) throw new Error(`syncCampaigns: campaigns read failed: ${exErr.message}`);
  const existingById = new Map((existingCamps ?? []).map((r: { id: string; created_at: string; vertical: string; persona_id: string | null }) => [r.id, r]));
  const createdAtById = new Map([...existingById.entries()].map(([id, r]) => [id, r.created_at]));
  const { data: existingVars, error: varErr } = await db.from("sequence_variants").select("id");
  if (varErr) throw new Error(`syncCampaigns: variants read failed: ${varErr.message}`);
  const knownVariantIds = new Set((existingVars ?? []).map((r: { id: string }) => r.id));

  const campInserts: Record<string, unknown>[] = [];
  const campUpdates: Record<string, unknown>[] = [];
  const varInserts: Record<string, unknown>[] = [];
  const varUpdates: Record<string, unknown>[] = [];
  const liveIds = new Set<string>();

  for (const c of campaigns) {
    if (!c.id) continue;
    const cid = `c_${c.id}`;
    liveIds.add(cid);
    const shared = {
      id: cid, name: c.name ?? "(untitled)", status: statusFor(c.status),
      instantly_campaign_id: c.id,
      inbox_ids: (c.email_list ?? []).map((e) => `ib_${slug(e)}`),
      daily_cap: c.daily_limit ?? 80,
    };
    if (createdAtById.has(cid)) {
      // Updates go through the same upsert call — and Postgres builds the INSERT tuple
      // BEFORE conflict arbitration, so every NOT-NULL column must be present even though
      // the row exists (first live cron run failed exactly here on `vertical`). Echo the
      // EXISTING hub-owned values: constraint satisfied, nothing clobbered.
      const prev = existingById.get(cid)!;
      campUpdates.push({ ...shared, vertical: prev.vertical, persona_id: prev.persona_id });
    } else {
      campInserts.push({
        ...shared,
        vertical: verticalFor(c.name ?? ""), persona_id: personaFor(c.name ?? ""),
        list_version: "instantly", created_at: new Date().toISOString(),
      });
    }
    const seqs = (c.sequences as Seq[]) ?? [];
    for (const seq of seqs) {
      (seq.steps ?? []).forEach((step, stepIdx) => {
        (step.variants ?? []).forEach((v, vIdx) => {
          const vid = `sv_${c.id}_${stepIdx}_${vIdx}`;
          const sharedVar = { id: vid, campaign_id: cid, step: stepIdx + 1, variant: String.fromCharCode(65 + vIdx), subject: v.subject ?? "", body: stripHtml(v.body ?? "") };
          if (knownVariantIds.has(vid)) varUpdates.push(sharedVar); // counters untouched
          else varInserts.push({ ...sharedVar, sent: 0, opens: 0, replies: 0, positives: 0, approved: true });
        });
      });
    }
  }

  const campaignsWritten =
    (campInserts.length ? await chunkedUpsert("campaigns", campInserts) : 0) +
    (campUpdates.length ? await chunkedUpsert("campaigns", campUpdates) : 0);
  const variantsWritten =
    (varInserts.length ? await chunkedUpsert("sequence_variants", varInserts) : 0) +
    (varUpdates.length ? await chunkedUpsert("sequence_variants", varUpdates) : 0);

  // Reconcile deletions. The sync is the source of truth for genuinely Instantly-synced campaigns, so a
  // hub campaign that has an instantly_campaign_id no longer in the live list was deleted there — prune it
  // (and its variants) so deletions propagate. Scope strictly to rows WITH an instantly_campaign_id: that
  // leaves hub-native drafts AND clones untouched. Guards: only prune when the fetch actually returned
  // campaigns (a transient empty Instantly response can never wipe the hub), and only rows created BEFORE
  // this sync started — a campaign pushed mid-sync isn't in our stale snapshot of the live list.
  let pruned = 0;
  if (liveIds.size > 0) {
    const { data: existing, error: prErr } = await db.from("campaigns").select("id, created_at").not("instantly_campaign_id", "is", null);
    if (prErr) throw new Error(`syncCampaigns: prune read failed: ${prErr.message}`);
    const stale = (existing ?? [])
      .filter((r: { id: string; created_at: string }) => !liveIds.has(r.id) && r.created_at < syncStart)
      .map((r: { id: string }) => r.id);
    const toDrop = [...stale, "c_medspa"]; // + the legacy seeded placeholder
    // FK-aware prune order, errors CHECKED — the old unchecked deletes destroyed the variants,
    // silently failed on the campaign FK, and reported `pruned` anyway, forever.
    for (const [step, run] of [
      ["leads detach", () => db.from("leads").update({ campaign_id: null }).in("campaign_id", toDrop)],
      ["replies detach", () => db.from("replies").update({ campaign_id: null }).in("campaign_id", toDrop)],
      ["metrics", () => db.from("daily_metrics").delete().in("campaign_id", toDrop)],
      ["landing pages", () => db.from("landing_pages").delete().in("campaign_id", toDrop)],
      ["variants", () => db.from("sequence_variants").delete().in("campaign_id", toDrop)],
      ["campaigns", () => db.from("campaigns").delete().in("id", toDrop)],
    ] as const) {
      const { error } = await run();
      if (error && error.code !== "42P01") throw new Error(`syncCampaigns: prune failed (${step}): ${error.message}`);
    }
    pruned = stale.length;
  }

  return { campaigns: campaignsWritten, variants: variantsWritten, pruned };
}
