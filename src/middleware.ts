import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/session";

/**
 * Gate the whole app behind a shared login. If AUTH_SECRET isn't configured
 * (e.g. local preview), the gate is open. API routes self-authenticate with
 * their own secrets, and /login must be reachable, so both are excluded.
 * The cookie carries a SIGNED, EXPIRING token — never AUTH_SECRET itself.
 */
export async function middleware(req: NextRequest) {
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
