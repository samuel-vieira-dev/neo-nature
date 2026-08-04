import { NextResponse } from "next/server";
import { ADMIN_COOKIE, destroyAdminSession } from "@/server/session";

export async function POST() {
  await destroyAdminSession();
  return Response.json({ ok: true });
}

/**
 * Clears the admin cookie and bounces to /admin-login.
 *
 * The admin layout redirects here when the session JWT is valid but the admin
 * no longer exists in the DB (e.g. after a data reset). A Server Component
 * can't delete a cookie, and the proxy only checks the JWT — so without this
 * hop the browser ping-pongs /admin-login → /admin → /admin-login forever.
 */
export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL("/admin-login", request.url));
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
