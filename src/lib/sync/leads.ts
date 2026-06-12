/** Sync Zoho CRM leads into the hub DB + mirror opt-outs into suppression. */
import { getLeads } from "@/lib/integrations/zoho";
import { chunkedUpsert, supabaseAdmin } from "@/lib/data/supabase";
import type { LeadStatus } from "@/lib/data/types";

const FIELDS = ["Email", "First_Name", "Last_Name", "Company", "Lead_Status", "Phone", "Email_Opt_Out"];

function mapStatus(s: string | null): LeadStatus {
  if (!s) return "new";
  const v = s.toLowerCase();
  // Demo + closed stages first (order matters — "unqualified" must beat "qualified").
  if (v.includes("closed") || v.includes("won") || v.includes("customer")) return "closed";
  if (v.includes("demo") || v.includes("meeting booked")) {
    return v.includes("show") || v.includes("attend") || v.includes("complet") ? "demo_showed" : "demo_booked";
  }
  if (v.includes("not contacted") || v === "new") return "new";
  if (v.includes("unqualified") || v.includes("not qualified") || v.includes("disqualif") || v.includes("lost") || v.includes("junk")) return "lost";
  if (v.includes("qualified") || v.includes("interest")) return "positive";
  if (v.includes("contacted") || v.includes("attempted")) return "contacted";
  return "new";
}

// Lead lifecycle stage -> demo-scoreboard status.
const DEMO_STAGE: Record<string, string> = { demo_booked: "booked", demo_showed: "showed", closed: "closed" };

export async function syncLeads() {
  // One identity, one row: hub-sourced leads carry zoho_lead_id from the load flow — without
  // this lookup the sync re-created every one of them under a second `zl_` id with NO
  // campaign/persona/sendingDomain attribution, and lifecycle updates landed on the duplicate.
  const db = supabaseAdmin();
  const { data: existing, error: exErr } = await db.from("leads").select("id,zoho_lead_id,created_at");
  if (exErr) throw new Error(`syncLeads: existing-leads read failed: ${exErr.message}`);
  const idByZoho = new Map<string, string>();
  const createdById = new Map<string, string>();
  for (const r of (existing ?? []) as { id: string; zoho_lead_id: string | null; created_at: string }[]) {
    if (r.zoho_lead_id) idByZoho.set(r.zoho_lead_id, r.id);
    createdById.set(r.id, r.created_at);
  }

  const rows: Record<string, unknown>[] = [];
  const optOut: { id: string; email: string }[] = [];
  for (let page = 1; page <= 50; page++) {
    const batch = (await getLeads(FIELDS, page)) as Record<string, unknown>[];
    if (!batch.length) break;
    for (const l of batch) {
      const get = (k: string) => (l[k] == null ? null : String(l[k]));
      const email = (get("Email") ?? "").trim().toLowerCase();
      if (!email) continue;
      const zohoId = get("id") ?? "";
      // Reuse the existing hub row for this Zoho identity (hub-sourced `l_*` or prior `zl_*`).
      const id = idByZoho.get(zohoId) ?? `zl_${zohoId}`;
      rows.push({
        id,
        email,
        domain: email.split("@")[1] || "unknown",
        first_name: get("First_Name"),
        last_name: get("Last_Name"),
        company: get("Company"),
        phone: get("Phone"),
        status: mapStatus(get("Lead_Status")),
        zoho_lead_id: zohoId,
        created_at: createdById.get(id) ?? new Date().toISOString(),
      });
      if (get("Email_Opt_Out") === "true") optOut.push({ id, email });
    }
    if (batch.length < 200) break;
  }

  // Split inserts from updates so hub-owned columns survive a resync: `source` (attribution)
  // is only written on brand-new rows; `vertical`/persona/sendingDomain are never written at
  // all (the old payload set vertical:null and source:"zoho" on EVERY row, every sync).
  const inserts = rows.filter((r) => !createdById.has(r.id as string)).map((r) => ({ ...r, source: "zoho" }));
  const updates = rows.filter((r) => createdById.has(r.id as string));
  const leads =
    (inserts.length ? await chunkedUpsert("leads", inserts) : 0) +
    (updates.length ? await chunkedUpsert("leads", updates) : 0);

  // Leads that reached a demo/closed stage feed the demo scoreboard. (No demo
  // stage exists in the Zoho picklist yet, so this is a no-op until one does.)
  // INSERT-ONLY: a resync must not clobber an operator-recorded MRR / scheduled time.
  const { data: demoExisting, error: demoErr } = await db.from("demos").select("id");
  if (demoErr) throw new Error(`syncLeads: demos read failed: ${demoErr.message}`);
  const haveDemos = new Set((demoExisting ?? []).map((r: { id: string }) => r.id));
  const demoRows = rows
    .filter((r) => DEMO_STAGE[r.status as string])
    .map((r) => ({
      id: `dm_${r.zoho_lead_id}`,
      lead_id: r.id,
      scheduled_at: r.created_at,
      status: DEMO_STAGE[r.status as string],
      owner: "zoho",
      mrr: null,
    }))
    .filter((r) => !haveDemos.has(r.id));
  const demos = demoRows.length ? await chunkedUpsert("demos", demoRows) : 0;

  // Mirror Zoho opt-outs into the global suppression universe (skip already-listed,
  // dedupe by email IN-BATCH too — two Zoho contacts sharing one address used to 23505
  // the whole chunk on the unique lower(email) index).
  let suppressed = 0;
  if (optOut.length) {
    const { data: supRows, error: supErr } = await db.from("suppression").select("email");
    if (supErr) throw new Error(`syncLeads: suppression read failed: ${supErr.message}`);
    const have = new Set((supRows ?? []).map((r: { email: string | null }) => (r.email ?? "").toLowerCase()).filter(Boolean));
    const inserts = optOut
      .filter((o) => !have.has(o.email) && (have.add(o.email), true))
      .map((o) => ({ id: `sup_${o.id}`, email: o.email, domain: null, reason: "dnc", source: "zoho:opt_out", lead_id: o.id, note: "Zoho Email Opt Out", created_at: new Date().toISOString() }));
    if (inserts.length) suppressed = await chunkedUpsert("suppression", inserts);
  }

  return { leads, fetched: rows.length, suppressed, demos };
}
