import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/session";
import { isLandingHost, normalizeHost } from "@/lib/landing/publish";

/**
 * Two jobs:
 * 1. PUBLIC landing pages — a request whose Host is a published landing domain (anything
 *    that isn't the app's own host / a Vercel preview / localhost) is rewritten to the
 *    public /lp renderer and NEVER sees the login gate. Requires NEXT_PUBLIC_APP_URL so we
 *    positively know our own host; without it, everything stays behind auth (fail closed).
 * 2. Gate the app behind the shared login. If AUTH_SECRET isn't configured (e.g. local
 *    preview), the gate is open. API routes self-authenticate, /login must be reachable.
 *    The cookie carries a SIGNED, EXPIRING token — never AUTH_SECRET itself.
 */
export async function middleware(req: NextRequest) {
  const appHost = (() => {
    try {
      return process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : "";
    } catch {
      return "";
    }
  })();
  const reqHost = normalizeHost(req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  if (appHost && isLandingHost(reqHost, appHost)) {
    const url = req.nextUrl.clone();
    url.pathname = `/lp/${reqHost}`;
    return NextResponse.rewrite(url);
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.next();
  if (await verifySession(secret, req.cookies.get("ciq_auth")?.value)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
