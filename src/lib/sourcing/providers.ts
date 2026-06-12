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

/**
 * Google-review signal for personalization — a real "you're clearly busy" fact (rating +
 * review count) via Outscraper. PAID per call, so it only fires when Outscraper is connected;
 * returns null otherwise / on error / on thin data. An optional personalization signal.
 */
export async function googleReviewSignal(company: string, location?: string): Promise<string | null> {
  if (!integrations.outscraper || !company.trim()) return null;
  try {
    const query = [company.trim(), location].filter(Boolean).join(", ");
    const url = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(query)}&limit=1&async=false`;
    const res = await httpJson<{ data?: Array<Array<Record<string, unknown>>> }>("outscraper", url, {
      headers: { "X-API-KEY": process.env.OUTSCRAPER_API_KEY! },
      timeoutMs: 60000,
    });
    const place = res.data?.[0]?.[0];
    if (!place) return null;
    const rating = Number(place.rating);
    const reviews = Number(place.reviews ?? place.reviews_count);
    if (!Number.isFinite(rating) || rating <= 0 || !Number.isFinite(reviews) || reviews < 5) return null;
    return `Rated ${rating}★ across ${reviews.toLocaleString()} Google reviews`;
  } catch {
    return null;
  }
}

/**
 * Recent-news signal (Phase 2) — a real, specific company moment (an award, a new location, a
 * press mention) via Outscraper's Google Search. PAID per call, so it only fires when Outscraper
 * is connected; returns null otherwise / on thin data. Parsed defensively — an unexpected shape
 * just yields null (Claude then falls back to its other signals).
 */
export async function companyNewsSignal(company: string, location?: string): Promise<string | null> {
  if (!integrations.outscraper || !company.trim()) return null;
  try {
    const query = [`${company.trim()} news`, location].filter(Boolean).join(" ");
    const url = `https://api.app.outscraper.com/google-search-v3?query=${encodeURIComponent(query)}&pagesPerQuery=1&async=false`;
    const res = await httpJson<{ data?: Array<{ organic_results?: Array<{ title?: string; description?: string; snippet?: string }> }> }>(
      "outscraper",
      url,
      { headers: { "X-API-KEY": process.env.OUTSCRAPER_API_KEY! }, timeoutMs: 60000 },
    );
    const organic = res.data?.[0]?.organic_results ?? [];
    const top = organic.find((o) => (o.title || o.description || o.snippet || "").trim());
    if (!top) return null;
    const headline = (top.title || "").trim();
    const snippet = (top.description || top.snippet || "").trim();
    const text = [headline, snippet].filter(Boolean).join(" — ").slice(0, 240);
    return text ? `Recent mention: ${text}` : null;
  } catch {
    return null;
  }
}

/**
 * Social-activity signal (Phase 2) — recent public social / LinkedIn activity for a prospect, via a
 * pluggable social-data provider. This is the honest seam: doing fresh social signals WELL needs a
 * real provider, so it stays dark until SOCIAL_SIGNAL_API_KEY + SOCIAL_SIGNAL_API_URL are set, then
 * lights up like every other integration. POSTs { domain, company }; accepts a few common response
 * shapes; returns ONE specific line or null (never invents). Confirm the wire format when a key is
 * added — the self-gating + defensive parse mean a mismatch degrades to null rather than breaking.
 */
/**
 * Proxycurl (nubela.co) — the standard LinkedIn-data API. Resolves the company from its
 * domain, then summarizes the LinkedIn presence into one personalization signal. Credit-
 * metered per call; only invoked when PROXYCURL_API_KEY is set, and any error/missing
 * data returns null so personalization just uses its other signals.
 */
async function proxycurlCompanySignal(domain: string): Promise<string | null> {
  const key = process.env.PROXYCURL_API_KEY;
  if (!key) return null;
  try {
    const headers = { Authorization: `Bearer ${key}` };
    const resolve = await httpJson<{ url?: string }>(
      "proxycurl",
      `https://nubela.co/proxycurl/api/linkedin/company/resolve?company_domain=${encodeURIComponent(domain)}`,
      { headers, timeoutMs: 20000 },
    );
    if (!resolve.url) return null;
    const co = await httpJson<{ tagline?: string; description?: string; follower_count?: number; specialities?: string[]; updates?: Array<{ text?: string }> }>(
      "proxycurl",
      `https://nubela.co/proxycurl/api/linkedin/company?url=${encodeURIComponent(resolve.url)}&use_cache=if-present`,
      { headers, timeoutMs: 20000 },
    );
    const update = co.updates?.find((u) => (u.text ?? "").trim())?.text?.trim();
    if (update) return `Recent LinkedIn post from the company: ${update.slice(0, 240)}`;
    const about = (co.tagline || co.description || "").trim();
    if (about) return `Their LinkedIn describes them as: ${about.slice(0, 200)}`;
    return null;
  } catch {
    return null;
  }
}

export async function socialActivitySignal(input: { domain?: string; company?: string }): Promise<string | null> {
  // Preferred provider when keyed; the generic webhook adapter below stays as the fallback.
  if (integrations.proxycurl && input.domain) {
    const viaProxycurl = await proxycurlCompanySignal(input.domain);
    if (viaProxycurl) return viaProxycurl;
  }
  if (!integrations.socialSignals) return null;
  const base = process.env.SOCIAL_SIGNAL_API_URL;
  if (!base || (!input.domain && !input.company)) return null;
  try {
    const res = await httpJson<{ signal?: string; summary?: string; posts?: Array<{ text?: string; date?: string }> }>(
      "social",
      base,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.SOCIAL_SIGNAL_API_KEY!}`, "content-type": "application/json" },
        body: JSON.stringify({ domain: input.domain, company: input.company }),
        timeoutMs: 30000,
      },
    );
    const direct = (res.signal || res.summary || "").trim();
    if (direct) return `Recent social activity: ${direct.slice(0, 240)}`;
    const post = res.posts?.find((p) => (p.text || "").trim());
    if (post?.text) return `Recent post: ${post.text.trim().slice(0, 240)}`;
    return null;
  } catch {
    return null;
  }
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
