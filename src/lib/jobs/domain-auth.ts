/**
 * Real SPF / DKIM / DMARC verification via live DNS — replaces the hardcoded auth
 * status the sync writes. Lookups go over DNS-over-HTTPS (plain fetch): raw UDP DNS
 * from a serverless function is unreliable, and a silent resolver failure here meant
 * the verifier never corrected the sync's dmarc:false placeholder. Fail-safe — a
 * lookup that errors or times out reads as "not found", never throws.
 */
import { getDomains, updateDomainAuth } from "@/lib/data/store";

async function txt(name: string): Promise<string[]> {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { Answer?: { type?: number; data?: string }[] };
    // TXT data may arrive as `"chunk" "chunk"` for >255-char records — strip quotes and join.
    return (j.Answer ?? [])
      .filter((a) => a.type === 16 && typeof a.data === "string")
      .map((a) => (a.data as string).replace(/"\s+"/g, "").replace(/^"|"$/g, ""));
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

/** Verify every known domain and write the real status back to the hub. Checks run in
 *  parallel so the whole fleet fits comfortably inside the daily cron's time budget. */
export async function verifyAllDomains(): Promise<{ checked: number; results: DomainAuth[] }> {
  const domains = getDomains();
  const results = await Promise.all(domains.map((d) => checkDomainAuth(d.domain)));
  for (let i = 0; i < domains.length; i++) {
    const a = results[i];
    await updateDomainAuth(domains[i].id, { spf: a.spf, dkim: a.dkim, dmarc: a.dmarc });
  }
  return { checked: results.length, results };
}
