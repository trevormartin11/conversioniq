/**
 * Provider adapters — the activation edges of the engine. Each one is gated on
 * its key (via `integrations`) and normalizes its provider's response into our
 * shared shapes. They are written against each provider's documented API; the
 * request/response wire formats should be confirmed against live docs when a key
 * is first added (we can't exercise them without one). The engine calls these
 * defensively and degrades gracefully if a provider is absent or errors.
 */
import { integrations } from "@/lib/config";
import { httpJson, NotConfiguredError } from "@/lib/integrations/http";
import type { SourcedLead, SourcingTarget } from "./types";

const DEFAULT_TITLES = ["owner", "founder", "president", "general manager", "practice manager"];

/**
 * Outscraper — Google Maps business records. `enrichment=domains_service` appends the
 * business's published website emails (email_1..email_3) + phone INLINE in the same call,
 * so the local lane needs no separate email-finder. Whatever comes back is still run
 * through MillionVerifier before load.
 */
export async function outscraperSearch(t: SourcingTarget, limit: number): Promise<SourcedLead[]> {
  if (!integrations.outscraper) throw new NotConfiguredError("outscraper");
  const query = [t.vertical, t.geo ?? "United States"].filter(Boolean).join(", ");
  const url = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(query)}&limit=${limit}&enrichment=domains_service&async=false`;
  const res = await httpJson<{ data?: Array<Array<Record<string, unknown>>> }>("outscraper", url, {
    headers: { "X-API-KEY": process.env.OUTSCRAPER_API_KEY! },
    timeoutMs: 180000, // enrichment crawls each site — give it room
  });
  const rows = (res.data?.[0] ?? []) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    company: String(r.name ?? r.title ?? "(unknown)"),
    domain: hostOf(r.site as string | undefined),
    email: firstEmail(r),
    phone: (r.phone as string | undefined) ?? (r.phone_1 as string | undefined),
    city: r.city as string | undefined,
    state: r.state as string | undefined,
    source: "outscraper" as const,
  }));
}

/** Pick the first published email Outscraper returns (email_1..email_3 / emails[] / email). */
function firstEmail(r: Record<string, unknown>): string | undefined {
  for (const k of ["email_1", "email_2", "email_3", "email"]) {
    const v = r[k];
    if (typeof v === "string" && v.includes("@")) return v.trim().toLowerCase();
  }
  const arr = r.emails;
  if (Array.isArray(arr)) {
    const hit = arr.find((e) => typeof e === "string" && e.includes("@"));
    if (typeof hit === "string") return hit.trim().toLowerCase();
  }
  return undefined;
}

/** Findymail — find a deliverable email for a business/owner from name + domain. */
export async function findymailEnrich(lead: SourcedLead): Promise<SourcedLead> {
  if (!integrations.findymail || !lead.domain) return lead;
  try {
    const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "owner";
    const res = await httpJson<{ contact?: { email?: string } }>("findymail", "https://app.findymail.com/api/search/name", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.FINDYMAIL_API_KEY!}`, "content-type": "application/json" },
      body: JSON.stringify({ name, domain: lead.domain }),
    });
    const email = res.contact?.email;
    return email ? { ...lead, email } : lead;
  } catch {
    return lead; // enrichment misses are normal; keep the lead, drop later if no email
  }
}

/** Lusha — corporate/enterprise contacts. Search returns people; emails come from reveal (paid). */
export async function lushaSearch(t: SourcingTarget, limit: number): Promise<SourcedLead[]> {
  if (!integrations.lusha) throw new NotConfiguredError("lusha");
  const res = await httpJson<{ data?: Array<Record<string, unknown>> }>("lusha", "https://api.lusha.com/prospecting/contact/search", {
    method: "POST",
    headers: { api_key: process.env.LUSHA_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({
      pages: { page: 0, size: Math.min(limit, 50) },
      filters: { contacts: { include: { jobTitles: t.titles ?? DEFAULT_TITLES } } },
    }),
    timeoutMs: 60000,
  });
  const rows = (res.data ?? []) as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const company = (r.company as Record<string, unknown>) ?? {};
    return {
      firstName: r.firstName as string | undefined,
      lastName: r.lastName as string | undefined,
      title: ((r.jobTitle as Record<string, unknown>)?.title as string) ?? undefined,
      company: String(company.name ?? "(unknown)"),
      domain: hostOf(company.domain as string | undefined),
      emailStatus: "unknown" as const,
      source: "lusha" as const,
    };
  });
}

/** MillionVerifier — the always-on verification pass that protects the fleet. */
export async function verifyEmail(email: string): Promise<SourcedLead["emailStatus"]> {
  if (!integrations.millionverifier) return "unknown";
  try {
    const url = `https://api.millionverifier.com/api/v3/?api=${process.env.MILLIONVERIFIER_API_KEY!}&email=${encodeURIComponent(email)}`;
    const res = await httpJson<{ result?: string }>("millionverifier", url, { timeoutMs: 15000 });
    switch (res.result) {
      case "ok": return "verified";
      case "catch_all":
      case "unknown": return "risky";
      default: return "invalid"; // disposable / invalid
    }
  } catch {
    return "unknown";
  }
}

function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}
