import { NextResponse, type NextRequest } from "next/server";

/**
 * Gate the whole app behind a shared login. If AUTH_SECRET isn't configured
 * (e.g. local preview), the gate is open. API routes self-authenticate with
 * their own secrets, and /login must be reachable, so both are excluded.
 */
export function middleware(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.next();
  if (req.cookies.get("ciq_auth")?.value === secret) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
