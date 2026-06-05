/** Sync Instantly inboxes + their domains into the hub DB. */
import { listAllAccounts } from "@/lib/integrations/instantly";
import { chunkedUpsert } from "@/lib/data/supabase";

function personaFor(local: string): string | null {
  const l = local.toLowerCase();
  if (l.startsWith("trevor") || l === "t.martin") return "pe_trevor";
  if (l.startsWith("jon") || l === "j.epstein") return "pe_jon";
  if (l.startsWith("brian") || l === "b.peters") return "pe_brian";
  return null;
}
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").toLowerCase();

/**
 * Map an Instantly account to our inbox status — robust to the API returning `status`
 * or the warmup score as strings (or omitting them). Defaults toward "warming", never
 * silently "paused": a paused status must be a definite, non-active numeric code.
 */
export function mapInboxStatus(a: { status?: number | string; stat_warmup_score?: number | string; setup_pending?: boolean }): { status: "active" | "warming" | "paused"; score: number } {
  const statusNum = typeof a.status === "string" ? Number(a.status) : a.status;
  const score = Number(a.stat_warmup_score) || 0;
  const paused = statusNum != null && Number.isFinite(statusNum) && statusNum !== 1;
  const status = paused ? "paused" : a.setup_pending || score < 80 ? "warming" : "active";
  return { status, score };
}

export async function syncInboxes() {
  const accounts = await listAllAccounts();
  const domains = new Map<string, Record<string, unknown>>();
  const inboxes: Record<string, unknown>[] = [];

  for (const a of accounts) {
    if (!a.email) continue;
    const [local, domain] = a.email.split("@");
    if (!domain) continue;
    const personaId = personaFor(local);
    const dId = `d_${slug(domain)}`;
    if (!domains.has(domain)) {
      domains.set(domain, { id: dId, domain, persona_id: personaId, spf: true, dkim: true, dmarc: false, reputation: "green" });
    }
    const { status, score } = mapInboxStatus(a);
    inboxes.push({
      // NB: bounce_rate / spam_complaints / sent_today / daily_cap are intentionally
      // omitted so a resync never clobbers real values (new rows use schema defaults;
      // those get populated by per-account analytics, not the /accounts list).
      id: `ib_${slug(a.email)}`,
      email: a.email,
      domain_id: dId,
      persona_id: personaId,
      instantly_account_id: a.email,
      warmup_score: score,
      status,
      last_synced_at: new Date().toISOString(),
    });
  }

  // domain is the natural unique key (ids may differ from earlier placeholders)
  const domainCount = await chunkedUpsert("domains", [...domains.values()], "domain");
  const inboxCount = await chunkedUpsert("inboxes", inboxes);
  return { domains: domainCount, inboxes: inboxCount };
}
