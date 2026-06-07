/**
 * Hyper-personalization (Phase 1) — generate ONE specific, TRUE opener line from a
 * prospect's website. Fetches the homepage, strips to text, and asks Claude for a single
 * line referencing something concrete on the page.
 *
 * Guardrails: hard timeout + size cap on the fetch, and the model is instructed to return
 * empty rather than invent. Returns null whenever we can't personalize (no AI key, no/blocked
 * site, nothing specific worth referencing) so callers fall back to the standard opener.
 * Phase 2 (social / LinkedIn signals) needs a paid data provider — no clean API exists.
 */
import { aiAvailable, complete } from "@/lib/integrations/anthropic";

export interface Personalization {
  line: string | null;
  basis: string | null; // short note on what the line drew from, for the reviewer
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

async function fetchSiteText(url: string, timeoutMs = 8000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; CIQ-personalization/1.0)" } });
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > 80 ? text.slice(0, 4000) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function personalizeFromUrl(
  rawUrl: string,
  context?: { company?: string; vertical?: string },
): Promise<Personalization> {
  const url = normalizeUrl(rawUrl);
  if (!url || !aiAvailable()) return { line: null, basis: null, source: "none" };
  const text = await fetchSiteText(url);
  if (!text) return { line: null, basis: null, source: "none" };
  try {
    const out = await complete({
      system:
        'You write one-line cold-email personalization openers. STRICT RULES: reference ONLY something concrete and specific actually stated on the page (a named service, location, claim, or recent note). Never invent, assume, or flatter. If the page has nothing specific worth referencing, return exactly {"line":"","basis":""}. The line must be under 25 words, natural, and human — not salesy, no emojis.',
      user: [
        context?.company ? `Prospect company: ${context.company}` : "",
        context?.vertical ? `Vertical: ${context.vertical}` : "",
        `Their website text (truncated):\n"""${text}"""`,
        `Write a single opener line that proves we actually looked at their site. Return ONLY JSON: {"line":"...","basis":"what on the page it drew from"}`,
      ].filter(Boolean).join("\n\n"),
      maxTokens: 200,
    });
    const parsed = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? out) as { line?: string; basis?: string };
    const line = (parsed.line ?? "").trim();
    return line ? { line, basis: (parsed.basis ?? "").trim() || null, source: "ai" } : { line: null, basis: null, source: "none" };
  } catch {
    return { line: null, basis: null, source: "none" };
  }
}
