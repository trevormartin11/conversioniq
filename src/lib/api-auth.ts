/**
 * Shared auth for ops endpoints (cron / sync / health) and inbound webhooks.
 *
 * Fail-closed in production: if the required secret isn't configured we DENY (503) rather than run
 * unauthenticated — the old per-route checks skipped verification entirely when the secret was unset,
 * which left the endpoints open. In dev/preview an unset secret is allowed so local testing works.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export type AuthResult = { ok: true } | { ok: false; status: number; error: string };

/** Constant-time equality via digest comparison (hides both content and length timing). */
function secretEquals(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

/** Pure auth decision — testable without a request/response. A plain `includes`/=== compare
 *  short-circuits on the first differing byte, giving a byte-by-byte timing oracle against
 *  `?secret=` — the Twilio path already used timingSafeEqual; this brings the shared gate
 *  (every cron/sync/webhook) in line. */
export function checkSecretAuth(opts: { configured: (string | undefined)[]; provided: string | null; isProd: boolean }): AuthResult {
  const secrets = opts.configured.filter((s): s is string => !!s);
  if (secrets.length === 0) {
    return opts.isProd ? { ok: false, status: 503, error: "auth secret not configured" } : { ok: true };
  }
  const provided = opts.provided;
  return provided && secrets.some((s) => secretEquals(s, provided))
    ? { ok: true }
    : { ok: false, status: 401, error: "unauthorized" };
}

const isProd = () => process.env.NODE_ENV === "production";
const toResponse = (r: AuthResult): NextResponse | null => (r.ok ? null : NextResponse.json({ ok: false, error: r.error }, { status: r.status }));

/** Bearer/secret gate for cron + sync + health endpoints (SYNC_SECRET or CRON_SECRET). */
export function cronAuthorized(req: NextRequest): NextResponse | null {
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("secret");
  return toResponse(checkSecretAuth({ configured: [process.env.SYNC_SECRET, process.env.CRON_SECRET], provided, isProd: isProd() }));
}

/** Header/query-secret gate for inbound webhooks (the named secret env). */
export function webhookAuthorized(req: NextRequest, envName: string): NextResponse | null {
  const provided = req.headers.get("x-webhook-secret") || req.nextUrl.searchParams.get("secret");
  return toResponse(checkSecretAuth({ configured: [process.env[envName]], provided, isProd: isProd() }));
}
