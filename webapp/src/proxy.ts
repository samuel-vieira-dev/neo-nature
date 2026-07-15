import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/login", "/api/auth", "/webhook-buygoods-info"];

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get("nn_session")?.value;
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
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const authed = await isAuthenticated(request);

  // Signed-in users don't need the login screen
  if (authed && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!authed && !isPublic) {
    if (pathname.startsWith("/api")) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except static assets and framework internals
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.json|sw.js|.*\\.(?:svg|png|jpg|webmanifest)).*)"],
};
