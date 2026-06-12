/**
 * Signed session tokens for the shared-password gate. Edge-safe (Web Crypto only) so the
 * same code runs in middleware and the login action.
 *
 * The old cookie literally stored AUTH_SECRET — every login shipped the master secret to
 * the browser, with no expiry and no way to invalidate a leaked cookie short of rotating
 * the secret for everyone. A token is `exp.hmac(AUTH_SECRET, exp)`: the secret never
 * leaves the server, tokens expire on their own, and rotation still works as the
 * kill-switch.
 */

const enc = new TextEncoder();

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string equality (both sides are fixed-length hex here). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function mintSession(secret: string, ttlMs = SESSION_TTL_MS): Promise<string> {
  const exp = String(Date.now() + ttlMs);
  return `${exp}.${await hmacHex(secret, exp)}`;
}

export async function verifySession(secret: string, token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return constantTimeEqual(sig, await hmacHex(secret, exp));
}

/** Only ever redirect to a same-origin path: `?next=https://evil.example` (or `//evil`) after
 *  login was an open redirect usable for phishing handoffs that start on the trusted domain. */
export function safeNextPath(next: string | null | undefined): string {
  return next && /^\/(?!\/)/.test(next) ? next : "/";
}
