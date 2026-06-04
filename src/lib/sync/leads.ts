/** Sync Zoho CRM leads into the hub DB. Zoho stays canonical; this mirrors for analytics. */
import { getLeads } from "@/lib/integrations/zoho";
import { chunkedUpsert } from "@/lib/data/supabase";
import type { LeadStatus } from "@/lib/data/types";

const FIELDS = ["Email", "First_Name", "Last_Name", "Company", "Lead_Status", "Phone"];

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
  for (let page = 1; page <= 50; page++) {
    const batch = (await getLeads(FIELDS, page)) as Record<string, unknown>[];
    if (!batch.length) break;
    for (const l of batch) {
      const get = (k: string) => (l[k] == null ? null : String(l[k]));
      const email = (get("Email") ?? "").trim().toLowerCase();
      if (!email) continue;
      rows.push({
        id: `zl_${get("id")}`,
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
    }
    if (batch.length < 200) break;
  }
  const leads = await chunkedUpsert("leads", rows);
  return { leads, fetched: rows.length };
}
