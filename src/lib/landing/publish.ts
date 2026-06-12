/**
 * Landing-page publishing — pure helpers. Pages publish to a SUBDOMAIN of the campaign's
 * sending domain (default "go.", e.g. go.ciqsends.com): the root record keeps serving
 * whatever it serves today, so publishing can never disturb a warmed sending domain's DNS
 * during launch week.
 */
import { appConfig } from "@/lib/config";

/** Vercel's universal CNAME target for project domains. */
export const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";

/**
 * The host a page publishes to. A bare sending domain gets the landing subdomain prefixed;
 * a host that's already a subdomain (operator typed "book.x.com") is used verbatim.
 */
export function publishHostFor(domain: string, sub = appConfig.landing.subdomain): string {
  const d = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return d.split(".").length >= 3 ? d : `${sub}.${d}`;
}

/** The DNS record name for the host within its zone ("go.x.com" within "x.com" → "go"). */
export function recordNameFor(host: string, zone: string): string {
  return host === zone ? "@" : host.replace(new RegExp(`\\.${zone.replace(/\./g, "\\.")}$`), "");
}

/** Hostname comparison for the public router (ports/casing stripped). */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").split(":")[0].trim().toLowerCase();
}

/**
 * Should this request be routed to a public landing page instead of the app?
 * Only when we positively know the app's own host AND the request targets a different,
 * non-Vercel-preview, non-local host — fail toward the app (auth) on any ambiguity.
 */
export function isLandingHost(requestHost: string, appHost: string): boolean {
  const req = normalizeHost(requestHost);
  const app = normalizeHost(appHost);
  if (!req || !app || req === app) return false;
  if (req === "localhost" || req.endsWith(".localhost") || req.endsWith(".vercel.app")) return false;
  return true;
}
