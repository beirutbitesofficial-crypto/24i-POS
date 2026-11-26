import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/api/health", "/_next", "/favicon", "/manifest.webmanifest", "/icons/", "/icon", "/apple-icon"];

// Cheap gate: no session cookie → login. Real validation happens server-side on every page/action.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("pos24i_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
