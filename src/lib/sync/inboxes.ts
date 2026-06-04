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
    const score = typeof a.stat_warmup_score === "number" ? a.stat_warmup_score : 0;
    const status = a.status !== 1 ? "paused" : a.setup_pending || score < 80 ? "warming" : "active";
    inboxes.push({
      id: `ib_${slug(a.email)}`,
      email: a.email,
      domain_id: dId,
      persona_id: personaId,
      instantly_account_id: a.email,
      warmup_score: score,
      status,
      daily_cap: 30,
      sent_today: 0,
      bounce_rate: 0,
      spam_complaints: 0,
      last_synced_at: new Date().toISOString(),
    });
  }

  // domain is the natural unique key (ids may differ from earlier placeholders)
  const domainCount = await chunkedUpsert("domains", [...domains.values()], "domain");
  const inboxCount = await chunkedUpsert("inboxes", inboxes);
  return { domains: domainCount, inboxes: inboxCount };
}
