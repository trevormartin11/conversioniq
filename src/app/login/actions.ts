"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { mintSession, SESSION_TTL_MS } from "@/lib/session";

/** Constant-time password check via digest comparison (also hides length differences). */
function passwordMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Per-instance brute-force speed bump: 5 failures locks the login for 30s. Not a hard
// distributed limit (instances don't share state) — just removes unlimited free guessing.
const throttle: { fails: number; lockUntil: number } = ((globalThis as unknown as { __ciqLogin?: { fails: number; lockUntil: number } }).__ciqLogin ??= { fails: 0, lockUntil: 0 });

export async function loginAction(password: string) {
  // Distinguish misconfiguration from a wrong password — with APP_PASSWORD unset no password
  // can ever be correct, and "Incorrect password." hard-locks the operator with a lie.
  if (!process.env.APP_PASSWORD) {
    return { ok: false, error: "Login isn't configured (APP_PASSWORD is missing) — contact whoever deployed the hub." };
  }
  if (Date.now() < throttle.lockUntil) {
    return { ok: false, error: "Too many attempts — wait 30 seconds and try again." };
  }
  if (!passwordMatches(password, process.env.APP_PASSWORD)) {
    throttle.fails += 1;
    if (throttle.fails >= 5) {
      throttle.fails = 0;
      throttle.lockUntil = Date.now() + 30_000;
    }
    return { ok: false, error: "Incorrect password." };
  }
  throttle.fails = 0;
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  // A signed, expiring token — NOT the secret itself (the old cookie shipped AUTH_SECRET
  // verbatim to every browser that ever logged in, with no expiry or revocation path).
  const token = await mintSession(process.env.AUTH_SECRET ?? "dev-preview");
  jar.set("ciq_auth", token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: SESSION_TTL_MS / 1000 });
  return { ok: true };
}

export async function logoutAction() {
  const jar = await cookies();
  jar.delete("ciq_auth");
  redirect("/login");
}
