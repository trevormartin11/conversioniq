/**
 * Hyper-personalization (Phase 1) — generate ONE specific, TRUE opener line from real signals
 * about a prospect: their website (homepage + about/services) and, when available, a public
 * hiring signal (Apollo personal/free key). Claude is hard-instructed to reference only
 * something concrete + verifiable, and to return empty rather than invent — so a lead with
 * nothing specific quietly falls back to the standard opener (never filler).
 *
 * All signals here are free (site fetches + the free Apollo key). Paid signals (e.g. Outscraper
 * Google reviews) would be a deliberate, budgeted add-on. Phase 2 social needs a data provider.
 */
import { aiAvailable, complete } from "@/lib/integrations/anthropic";
import { apolloHiringSignal } from "@/lib/integrations/apollo";

export interface Personalization {
  line: string | null;
  basis: string | null;
  source: "ai" | "none";
}

/** Normalize a typed domain/url to a fetchable origin+path, or null if it isn't a real host. */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname.includes(".")) return null;
    return u.origin + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return null;
  }
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function fetchText(url: string, timeoutMs = 6000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; CIQ-personalization/1.0)" } });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/** Homepage + a couple of high-signal subpages (about/services), for specific, real context. */
async function gatherWebsiteText(origin: string): Promise<string> {
  const pages = [origin, `${origin}/about`, `${origin}/services`];
  const texts = await Promise.all(pages.map((p) => fetchText(p)));
  const combined = texts.filter(Boolean).join("\n\n").trim();
  return combined.length > 80 ? combined.slice(0, 5000) : "";
}

export async function personalizeFromUrl(rawUrl: string, context?: { company?: string; vertical?: string }): Promise<Personalization> {
  const url = normalizeUrl(rawUrl);
  if (!url || !aiAvailable()) return { line: null, basis: null, source: "none" };
  const domain = domainOf(url);
  const [website, hiring] = await Promise.all([
    gatherWebsiteText(url),
    domain ? apolloHiringSignal(domain) : Promise.resolve(null),
  ]);
  if (!website && !hiring) return { line: null, basis: null, source: "none" };
  try {
    const out = await complete({
      system:
        'You write one-line cold-email personalization openers. STRICT RULES: reference ONLY something concrete and specific from the signals provided (a named service, location, claim, or a real hiring signal). Never invent, assume, or flatter. If nothing specific is worth referencing, return exactly {"line":"","basis":""}. The line must be under 25 words, natural and human — not salesy, no emojis.',
      user: [
        context?.company ? `Prospect company: ${context.company}` : "",
        context?.vertical ? `Vertical: ${context.vertical}` : "",
        website ? `Website text (homepage + about/services, truncated):\n"""${website}"""` : "",
        hiring ? `Public signal: ${hiring}` : "",
        `Write a single opener line that proves we actually looked — prefer the most specific, verifiable detail. Return ONLY JSON: {"line":"...","basis":"what it drew from"}`,
      ].filter(Boolean).join("\n\n"),
      maxTokens: 220,
    });
    const parsed = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? out) as { line?: string; basis?: string };
    const line = (parsed.line ?? "").trim();
    return line ? { line, basis: (parsed.basis ?? "").trim() || null, source: "ai" } : { line: null, basis: null, source: "none" };
  } catch {
    return { line: null, basis: null, source: "none" };
  }
}
