/**
 * Apollo client — DATA (search + enrich). Uses the PERSONAL key only.
 * The CIQ (paid-credit) key is never touched by the hub today — if CIQ-credit
 * enrichment is ever wired up, it must get its own explicitly confirmed spend path.
 *
 * Verified realities (brief):
 *   - Enrich BY ID returns real email + domain + phone:
 *       POST https://api.apollo.io/v1/people/match { id }, header X-Api-Key
 *   - Search returns NO email + NO domain (and /v1/mixed_people/search is
 *     DEPRECATED -> 422). Use api_search for discovery, then enrich by id.
 *   - Technographic filters are ~useless for SMB — do not gate targeting on them.
 */
import { integrations } from "@/lib/config";
import { httpJson, NotConfiguredError } from "./http";

const BASE = "https://api.apollo.io/v1";

function personalKey(): string {
  if (!integrations.apolloPersonal) throw new NotConfiguredError("apollo (personal)");
  return process.env.APOLLO_PERSONAL_API_KEY!;
}

/** Search (discovery only — NO email/domain returned). Uses the personal key. */
export async function searchPeople(payload: Record<string, unknown>): Promise<unknown> {
  return httpJson("apollo", `${BASE}/mixed_people/api_search`, {
    method: "POST",
    headers: { "X-Api-Key": personalKey(), "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** Enrich BY ID — returns real email/domain/phone. Personal key by default. */
export async function enrichById(id: string): Promise<unknown> {
  return httpJson("apollo", `${BASE}/people/match`, {
    method: "POST",
    headers: { "X-Api-Key": personalKey(), "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

/**
 * Best-effort hiring signal for personalization — via the PERSONAL (free) key only, NEVER the
 * gated CIQ key. Enriches the org by domain, then reads active job postings. Returns null on
 * no key / no data / error, so personalization just falls back to its other signals.
 */
export async function apolloHiringSignal(domain: string): Promise<string | null> {
  if (!integrations.apolloPersonal || !domain) return null;
  try {
    const org = await httpJson<{ organization?: { id?: string } }>(
      "apollo",
      `${BASE}/organizations/enrich?domain=${encodeURIComponent(domain)}`,
      { method: "GET", headers: { "X-Api-Key": personalKey() } },
    );
    const orgId = org.organization?.id;
    if (!orgId) return null;
    const jobs = await httpJson<{ organization_job_postings?: { title?: string }[] }>(
      "apollo",
      `${BASE}/organizations/${encodeURIComponent(orgId)}/job_postings`,
      { method: "GET", headers: { "X-Api-Key": personalKey() } },
    );
    const titles = (jobs.organization_job_postings ?? []).map((j) => j.title).filter((t): t is string => !!t).slice(0, 3);
    return titles.length ? `Currently hiring: ${titles.join(", ")}` : null;
  } catch {
    return null;
  }
}
