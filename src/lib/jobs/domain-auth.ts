/**
 * Real SPF / DKIM / DMARC verification via live DNS — replaces the hardcoded auth
 * status the sync writes. Runs server-side (Vercel) where DNS + the domain list are
 * available; fail-safe (a lookup that times out reads as "not found", never throws).
 */
import { Resolver } from "node:dns/promises";
import { getDomains, updateDomainAuth } from "@/lib/data/store";

const resolver = new Resolver({ timeout: 5000, tries: 2 });
resolver.setServers(["8.8.8.8", "1.1.1.1"]);

async function txt(name: string): Promise<string[]> {
  try {
    return (await resolver.resolveTxt(name)).map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

export function parseSpf(txts: string[]): { present: boolean; google: boolean } {
  const spf = txts.find((t) => /^v=spf1/i.test(t.trim()));
  return { present: !!spf, google: !!spf && /_spf\.google\.com|include:_?spf\.google/i.test(spf) };
}

export function parseDmarc(txts: string[]): { present: boolean; policy: string | null } {
  const d = txts.find((t) => /^v=dmarc1/i.test(t.trim()));
  if (!d) return { present: false, policy: null };
  const m = d.match(/\bp\s*=\s*([a-z]+)/i);
  return { present: true, policy: m ? m[1].toLowerCase() : null };
}

export function dkimPresent(txts: string[]): boolean {
  return txts.some((t) => /v=dkim1|k=rsa|p=[A-Za-z0-9/+]{20,}/i.test(t));
}

export interface DomainAuth {
  domain: string;
  spf: boolean;
  spfGoogle: boolean;
  dkim: boolean;
  dmarc: boolean;
  dmarcPolicy: string | null;
}

/** Check one domain's SPF / Google DKIM / DMARC live. */
export async function checkDomainAuth(domain: string): Promise<DomainAuth> {
  const [apex, dkimTxt, dmarcTxt] = await Promise.all([
    txt(domain),
    txt(`google._domainkey.${domain}`),
    txt(`_dmarc.${domain}`),
  ]);
  const spf = parseSpf(apex);
  const dmarc = parseDmarc(dmarcTxt);
  return { domain, spf: spf.present, spfGoogle: spf.google, dkim: dkimPresent(dkimTxt), dmarc: dmarc.present, dmarcPolicy: dmarc.policy };
}

/** Verify every known domain and write the real status back to the hub. */
export async function verifyAllDomains(): Promise<{ checked: number; results: DomainAuth[] }> {
  const results: DomainAuth[] = [];
  for (const d of getDomains()) {
    const a = await checkDomainAuth(d.domain);
    await updateDomainAuth(d.id, { spf: a.spf, dkim: a.dkim, dmarc: a.dmarc });
    results.push(a);
  }
  return { checked: results.length, results };
}
