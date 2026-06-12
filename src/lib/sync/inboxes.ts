/** Sync Instantly inboxes + their domains into the hub DB. */
import { listAllAccounts } from "@/lib/integrations/instantly";
import { chunkedUpsert, supabaseAdmin } from "@/lib/data/supabase";
import { createHash } from "node:crypto";

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

/**
 * Resolve a stable, collision-free inbox id. The slug is LOSSY (`.`/`+`/`-`/`_` all collapse
 * to `_`), so two real inboxes like jon.smith@ and jon-smith@ mapped to ONE id — the second
 * silently clobbered the first (lost warmup/status) and replies were gated/attributed against
 * the surviving impostor. Resolution order: the email's existing DB row keeps whatever id it
 * already has (migration-safe); a NEW email whose slug-id is taken by a DIFFERENT email gets
 * a short content-hash suffix (deterministic, so reruns converge).
 */
export function resolveInboxId(email: string, idByEmail: Map<string, string>, taken: Set<string>): string {
  const existing = idByEmail.get(email.toLowerCase());
  if (existing) return existing;
  const base = `ib_${slug(email)}`;
  if (!taken.has(base)) return base;
  return `${base}_${createHash("sha1").update(email.toLowerCase()).digest("hex").slice(0, 6)}`;
}

export async function syncInboxes() {
  const accounts = await listAllAccounts();
  const db = supabaseAdmin();

  // Existing identities first — email is the true natural key; ids must follow it.
  const [{ data: inboxRows, error: ibErr }, { data: domainRows, error: dErr }] = await Promise.all([
    db.from("inboxes").select("id,email"),
    db.from("domains").select("id,domain"),
  ]);
  if (ibErr) throw new Error(`syncInboxes: inboxes read failed: ${ibErr.message}`);
  if (dErr) throw new Error(`syncInboxes: domains read failed: ${dErr.message}`);
  const idByEmail = new Map(((inboxRows ?? []) as { id: string; email: string }[]).map((r) => [r.email.toLowerCase(), r.id]));
  const taken = new Set(((inboxRows ?? []) as { id: string }[]).map((r) => r.id));
  const domainIdByName = new Map(((domainRows ?? []) as { id: string; domain: string }[]).map((r) => [r.domain, r.id]));

  const domains = new Map<string, Record<string, unknown>>();
  const inboxes: Record<string, unknown>[] = [];

  for (const a of accounts) {
    if (!a.email) continue;
    const [local, domain] = a.email.split("@");
    if (!domain) continue;
    const personaId = personaFor(local);
    // Use the domain row's ACTUAL id when one exists — deriving it fresh from the slug broke
    // the inbox FK wholesale whenever an existing row used a different id scheme.
    const dId = domainIdByName.get(domain) ?? `d_${slug(domain)}`;
    if (!domainIdByName.has(domain) && !domains.has(domain)) {
      domains.set(domain, { id: dId, domain, persona_id: personaId, spf: true, dkim: true, dmarc: false, reputation: "green" });
    }
    const { status, score } = mapInboxStatus(a);
    const id = resolveInboxId(a.email, idByEmail, taken);
    taken.add(id);
    idByEmail.set(a.email.toLowerCase(), id);
    inboxes.push({
      // NB: bounce_rate / spam_complaints / sent_today / daily_cap are intentionally
      // omitted so a resync never clobbers real values (new rows use schema defaults;
      // those get populated by per-account analytics, not the /accounts list).
      id,
      email: a.email,
      domain_id: dId,
      persona_id: personaId,
      instantly_account_id: a.email,
      warmup_score: score,
      status,
      last_synced_at: new Date().toISOString(),
    });
  }

  // Only INSERT domains we've never seen. This used to upsert every domain with placeholder
  // auth values (spf/dkim true, dmarc false) — re-clobbering the verifier's real DNS results
  // on every sync, so DMARC showed red forever no matter what was in DNS. New domains get the
  // placeholders as a starting point until the next domain-auth verification corrects them.
  const newDomains = [...domains.values()];
  const domainCount = newDomains.length ? await chunkedUpsert("domains", newDomains, "domain") : 0;
  const inboxCount = await chunkedUpsert("inboxes", inboxes);
  return { domains: domainCount, inboxes: inboxCount };
}
