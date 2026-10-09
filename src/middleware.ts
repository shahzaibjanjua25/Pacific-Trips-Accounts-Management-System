import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHash } from "crypto";

const COOKIE = "pt_session";
const SECRET = process.env.AUTH_SECRET || "pacific-trips-auth-secret-change-in-prod-2026";

function validSession(raw: string | undefined): boolean {
  if (!raw) return false;
  const [userId, token, sig] = raw.split(".");
  if (!userId || !token || !sig) return false;
  const expect = createHash("sha256").update(userId + token + SECRET).digest("hex");
  return sig === expect;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const session = req.cookies.get(COOKIE)?.value;
  if (!validSession(session)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
