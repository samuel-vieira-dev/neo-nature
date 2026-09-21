import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Cookie names are duplicated here (not imported from server/session) so the
// middleware bundle stays free of DB/node deps.
const APP_COOKIE = "nn_session";
const ADMIN_COOKIE = "nn_admin";

const APP_PUBLIC = ["/access-error", "/login", "/refund", "/api/refund/access", "/api/refund-form", "/api/auth", "/api/health", "/webhook-buygoods-info", "/webhook-konnektive"];

async function hasValidCookie(request: NextRequest, name: string): Promise<boolean> {
  const token = request.cookies.get(name)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret-change-me"));
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ---- Admin area (separate session cookie: nn_admin) ----
  if (pathname === "/admin-login") {
    if (await hasValidCookie(request, ADMIN_COOKIE)) return NextResponse.redirect(new URL("/admin", request.url));
    return NextResponse.next();
  }
  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin");
  if (isAdminArea || isAdminApi) {
    if (await hasValidCookie(request, ADMIN_COOKIE)) return NextResponse.next();
    if (isAdminApi) return Response.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/admin-login", request.url));
  }

  // Accept email campaign links before existing-session redirects.
  if ((pathname === "/" || pathname === "/login") && (request.nextUrl.searchParams.has("order_id") || request.nextUrl.searchParams.has("email"))) {
    const url = new URL("/api/auth/link", request.url);
    url.searchParams.set("order_id", request.nextUrl.searchParams.get("order_id") ?? "");
    url.searchParams.set("email", request.nextUrl.searchParams.get("email") ?? "");
    const name = request.nextUrl.searchParams.get("name");
    if (name) url.searchParams.set("name", name);
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  // ---- Customer app (nn_session) ----
  const isPublic = APP_PUBLIC.some((p) => pathname.startsWith(p));
  const authed = await hasValidCookie(request, APP_COOKIE);

  if (authed && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (!authed && !isPublic) {
    if (pathname.startsWith("/api")) return Response.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|logo.svg|manifest.json|sw.js|.*\\.(?:svg|png|jpg|webmanifest)).*)"],
};
