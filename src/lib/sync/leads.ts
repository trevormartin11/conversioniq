/** Sync Zoho CRM leads into the hub DB + mirror opt-outs into suppression. */
import { getLeads } from "@/lib/integrations/zoho";
import { chunkedUpsert, supabaseAdmin } from "@/lib/data/supabase";
import type { LeadStatus } from "@/lib/data/types";

const FIELDS = ["Email", "First_Name", "Last_Name", "Company", "Lead_Status", "Phone", "Email_Opt_Out"];

function mapStatus(s: string | null): LeadStatus {
  if (!s) return "new";
  const v = s.toLowerCase();
  if (v.includes("not contacted") || v.includes("new")) return "new";
  if (v.includes("lost") || v.includes("junk") || v.includes("not qualified")) return "lost";
  if (v.includes("qualified") || v.includes("interest")) return "positive";
  if (v.includes("contacted") || v.includes("attempted")) return "contacted";
  return "new";
}

export async function syncLeads() {
  const rows: Record<string, unknown>[] = [];
  const optOut: { id: string; email: string }[] = [];
  for (let page = 1; page <= 50; page++) {
    const batch = (await getLeads(FIELDS, page)) as Record<string, unknown>[];
    if (!batch.length) break;
    for (const l of batch) {
      const get = (k: string) => (l[k] == null ? null : String(l[k]));
      const email = (get("Email") ?? "").trim().toLowerCase();
      if (!email) continue;
      const id = `zl_${get("id")}`;
      rows.push({
        id,
        email,
        domain: email.split("@")[1] || "unknown",
        first_name: get("First_Name"),
        last_name: get("Last_Name"),
        company: get("Company"),
        phone: get("Phone"),
        source: "zoho",
        vertical: null,
        status: mapStatus(get("Lead_Status")),
        zoho_lead_id: get("id"),
        created_at: new Date().toISOString(),
      });
      if (get("Email_Opt_Out") === "true") optOut.push({ id, email });
    }
    if (batch.length < 200) break;
  }

  const leads = await chunkedUpsert("leads", rows);

  // Mirror Zoho opt-outs into the global suppression universe (skip already-listed).
  let suppressed = 0;
  if (optOut.length) {
    const { data: supRows } = await supabaseAdmin().from("suppression").select("email");
    const have = new Set((supRows ?? []).map((r: { email: string | null }) => (r.email ?? "").toLowerCase()).filter(Boolean));
    const inserts = optOut
      .filter((o) => !have.has(o.email))
      .map((o) => ({ id: `sup_${o.id}`, email: o.email, domain: null, reason: "dnc", source: "zoho:opt_out", lead_id: o.id, note: "Zoho Email Opt Out", created_at: new Date().toISOString() }));
    if (inserts.length) suppressed = await chunkedUpsert("suppression", inserts);
  }

  return { leads, fetched: rows.length, suppressed };
}
