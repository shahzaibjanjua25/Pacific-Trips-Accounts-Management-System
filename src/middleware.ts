import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE, verifySessionValue } from "@/lib/auth-edge";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes
  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  const session = req.cookies.get(COOKIE)?.value;
  const ok = await verifySessionValue(session);

  if (!ok) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // CSRF: for mutating API calls, require same-origin
  if (
    pathname.startsWith("/api/") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
  ) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && host && !origin.endsWith(host)) {
      return NextResponse.json({ error: "CSRF blocked" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};