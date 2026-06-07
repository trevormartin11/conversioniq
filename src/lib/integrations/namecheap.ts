/**
 * Namecheap DNS — auto-add DMARC (and other) records to the sending domains.
 *
 * Safety-critical: setHosts REPLACES all host records, so we always read the existing
 * records first, add only what's missing, and write the full set back — never wiping MX
 * / SPF / DKIM. The merge + parse logic is pure + tested; the live calls are gated.
 *
 * Operational note: Namecheap rejects API calls from non-allow-listed IPs, so this must
 * run from a whitelisted static IP (NAMECHEAP_CLIENT_IP) — not from Vercel's dynamic IPs.
 */
import { integrations } from "@/lib/config";
import { NotConfiguredError } from "./http";

const BASE = "https://api.namecheap.com/xml.response";

/** Split an apex domain into Namecheap's SLD + TLD (TLD = everything after the first dot). */
export function splitDomain(domain: string): { sld: string; tld: string } | null {
  const d = domain.trim().toLowerCase().replace(/^www\./, "");
  const dot = d.indexOf(".");
  if (dot <= 0 || dot === d.length - 1) return null;
  return { sld: d.slice(0, dot), tld: d.slice(dot + 1) };
}

/** Build a DMARC record value. Defaults to monitor mode (p=none) — safe to start. */
export function buildDmarcRecord(opts?: { policy?: "none" | "quarantine" | "reject"; rua?: string }): string {
  const policy = opts?.policy ?? "none";
  const rua = opts?.rua ? `; rua=mailto:${opts.rua}; fo=1` : "";
  return `v=DMARC1; p=${policy}${rua}`;
}

export interface NcHost { name: string; type: string; address: string; mxPref: string; ttl: string }

export function parseHosts(xml: string): NcHost[] {
  const hosts: NcHost[] = [];
  const re = /<host\b([^>]*?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const get = (k: string) => attrs.match(new RegExp(`${k}="([^"]*)"`, "i"))?.[1] ?? "";
    if (!get("Type")) continue;
    hosts.push({ name: get("Name"), type: get("Type"), address: get("Address"), mxPref: get("MXPref") || "10", ttl: get("TTL") || "1800" });
  }
  return hosts;
}

/** Returns an error message if the API response isn't OK, else null. */
export function apiError(xml: string): string | null {
  if (/ApiResponse[^>]*Status="OK"/i.test(xml)) return null;
  const err = xml.match(/<Error[^>]*>([^<]*)<\/Error>/i)?.[1];
  return err?.trim() || "Namecheap API returned an error";
}

/** Add a _dmarc TXT host only if one isn't already present. Pure — the heart of the safety. */
export function mergeDmarcHost(hosts: NcHost[], record: string): { hosts: NcHost[]; added: boolean } {
  const has = hosts.some((h) => h.type.toUpperCase() === "TXT" && h.name.toLowerCase() === "_dmarc");
  if (has) return { hosts, added: false };
  return { hosts: [...hosts, { name: "_dmarc", type: "TXT", address: record, mxPref: "10", ttl: "1800" }], added: true };
}

function creds(): Record<string, string> {
  const apiUser = process.env.NAMECHEAP_USERNAME ?? "";
  return { ApiUser: apiUser, UserName: apiUser, ApiKey: process.env.NAMECHEAP_API_KEY ?? "", ClientIp: process.env.NAMECHEAP_CLIENT_IP ?? "" };
}

async function call(command: string, params: Record<string, string>): Promise<string> {
  if (!integrations.namecheap) throw new NotConfiguredError("namecheap");
  const qs = new URLSearchParams({ ...creds(), Command: command, ...params });
  const res = await fetch(`${BASE}?${qs.toString()}`);
  return res.text();
}

export async function getHosts(domain: string): Promise<NcHost[]> {
  const sd = splitDomain(domain);
  if (!sd) throw new Error(`Unsupported domain: ${domain}`);
  const xml = await call("namecheap.domains.dns.getHosts", { SLD: sd.sld, TLD: sd.tld });
  const err = apiError(xml);
  if (err) throw new Error(err);
  return parseHosts(xml);
}

export async function setHosts(domain: string, hosts: NcHost[]): Promise<void> {
  const sd = splitDomain(domain);
  if (!sd) throw new Error(`Unsupported domain: ${domain}`);
  const params: Record<string, string> = { SLD: sd.sld, TLD: sd.tld };
  hosts.forEach((h, i) => {
    const n = i + 1;
    params[`HostName${n}`] = h.name || "@";
    params[`RecordType${n}`] = h.type;
    params[`Address${n}`] = h.address;
    params[`TTL${n}`] = h.ttl || "1800";
    if (h.type.toUpperCase() === "MX") params[`MXPref${n}`] = h.mxPref || "10";
  });
  const xml = await call("namecheap.domains.dns.setHosts", params);
  const err = apiError(xml);
  if (err) throw new Error(err);
}

/** Read existing hosts, add the _dmarc TXT only if missing, write back. Never wipes records. */
export async function ensureDmarc(domain: string, record: string): Promise<{ added: boolean; live: boolean }> {
  if (!integrations.namecheap) return { added: false, live: false };
  const { hosts, added } = mergeDmarcHost(await getHosts(domain), record);
  if (added) await setHosts(domain, hosts);
  return { added, live: true };
}
