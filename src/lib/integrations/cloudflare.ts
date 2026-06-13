/**
 * Cloudflare DNS — programmatic record management for the sending domains.
 *
 * Why this exists alongside namecheap.ts: Cloudflare's API authenticates with a scoped
 * TOKEN (no IP allow-list), so it works from Vercel's dynamic serverless IPs — Namecheap
 * rejects those. When CLOUDFLARE_API_TOKEN is set, the hub prefers Cloudflare for landing
 * CNAMEs and DMARC fixes.
 *
 * Safety: unlike Namecheap's setHosts (which REPLACES the whole zone), Cloudflare creates
 * each record independently — adding the landing CNAME can never touch MX/SPF/DKIM/DMARC.
 * We still read-before-write so we never duplicate a host that already exists.
 */
import { integrations } from "@/lib/config";
import { httpJson, IntegrationError, NotConfiguredError } from "./http";

const BASE = "https://api.cloudflare.com/client/v4";

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" };
}

export interface CfRecord { id?: string; type: string; name: string; content: string; ttl?: number; proxied?: boolean }
interface CfEnvelope<T> { success: boolean; errors?: { code?: number; message?: string }[]; result: T }

/** Cloudflare returns 200 with {success:false, errors:[…]} on logical failures — surface those
 *  as a thrown error the same way an HTTP non-2xx would, so callers never act on a silent no-op. */
function unwrap<T>(env: CfEnvelope<T>): T {
  if (!env.success) {
    const msg = (env.errors ?? []).map((e) => e.message).filter(Boolean).join("; ") || "Cloudflare API error";
    throw new IntegrationError("cloudflare", msg);
  }
  return env.result;
}

/** The DNS record name (FQDN) for a host within a zone. "@"/zone apex → the bare domain. */
export function fqdn(domain: string, name: string): string {
  const n = name.trim().toLowerCase();
  const d = domain.trim().toLowerCase();
  if (!n || n === "@" || n === d) return d;
  return n.endsWith(`.${d}`) ? n : `${n}.${d}`;
}

/** Does a record already claim this host? (Any of the address-bearing types — a CNAME must not
 *  coexist with an A/AAAA on the same name, and a second TXT _dmarc would be a duplicate.) */
export function hostClaimed(records: CfRecord[], name: string, types: string[]): boolean {
  const target = name.toLowerCase();
  const want = types.map((t) => t.toUpperCase());
  return records.some((r) => r.name.toLowerCase() === target && want.includes(r.type.toUpperCase()));
}

async function zoneId(domain: string): Promise<string> {
  const env = await httpJson<CfEnvelope<{ id: string; name: string }[]>>(
    "cloudflare",
    `${BASE}/zones?name=${encodeURIComponent(domain)}&status=active`,
    { headers: authHeaders() },
  );
  const zones = unwrap(env);
  const zone = zones.find((z) => z.name.toLowerCase() === domain.toLowerCase());
  if (!zone) throw new IntegrationError("cloudflare", `zone not found for ${domain} (is it added to this Cloudflare account?)`);
  return zone.id;
}

async function listRecords(zid: string): Promise<CfRecord[]> {
  const env = await httpJson<CfEnvelope<CfRecord[]>>(
    "cloudflare",
    `${BASE}/zones/${zid}/dns_records?per_page=200`,
    { headers: authHeaders() },
  );
  return unwrap(env);
}

async function createRecord(zid: string, rec: CfRecord): Promise<void> {
  const env = await httpJson<CfEnvelope<CfRecord>>(
    "cloudflare",
    `${BASE}/zones/${zid}/dns_records`,
    { method: "POST", headers: authHeaders(), body: JSON.stringify({ ttl: 1, proxied: false, ...rec }) },
  );
  unwrap(env);
}

/** Add the landing CNAME (e.g. go.<domain> → cname.vercel-dns.com) only if its host is unclaimed.
 *  proxied:false = DNS-only, so Cloudflare answers the CNAME without putting its CDN in front of
 *  Vercel. Same {added,live} contract as the Namecheap version for a clean dispatch. */
export async function ensureCname(domain: string, name: string, target: string): Promise<{ added: boolean; live: boolean }> {
  if (!integrations.cloudflare) throw new NotConfiguredError("cloudflare");
  const host = fqdn(domain, name);
  const zid = await zoneId(domain);
  if (hostClaimed(await listRecords(zid), host, ["CNAME", "A", "AAAA"])) return { added: false, live: true };
  await createRecord(zid, { type: "CNAME", name: host, content: target, proxied: false });
  return { added: true, live: true };
}

/** Add a _dmarc TXT only if one isn't already present — read-before-write, never duplicates. */
export async function ensureDmarc(domain: string, record: string): Promise<{ added: boolean; live: boolean }> {
  if (!integrations.cloudflare) throw new NotConfiguredError("cloudflare");
  const host = fqdn(domain, "_dmarc");
  const zid = await zoneId(domain);
  if (hostClaimed(await listRecords(zid), host, ["TXT"])) return { added: false, live: true };
  await createRecord(zid, { type: "TXT", name: host, content: record });
  return { added: true, live: true };
}
