import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { adminSessionUserId, destroyAdminSession } from "./session";

// Admin allowlist. Override with ADMIN_EMAILS (comma-separated) on Railway.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "admin@neonature.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Resolves the current admin from the SEPARATE admin session cookie (nn_admin),
 * so it's independent from the customer app session (nn_session). Returns null
 * when there's no valid admin session.
 */
export async function getAdminUser(): Promise<User | null> {
  const uid = await adminSessionUserId();
  if (!uid) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, uid) });
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

/** Asserts an admin session, else throws a Response (clears a stale cookie). */
export async function requireAdmin(): Promise<User> {
  const user = await getAdminUser();
  if (user) return user;
  await destroyAdminSession();
  throw Response.json({ error: "forbidden" }, { status: 403 });
}

/** Wraps an admin route handler: resolves the admin, converts thrown Responses. */
export function withAdmin<T extends unknown[]>(
  handler: (admin: User, ...args: T) => Promise<Response>
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      const admin = await requireAdmin();
      return await handler(admin, ...args);
    } catch (e) {
      if (e instanceof Response) return e;
      console.error("[admin-api]", e);
      return Response.json({ error: "internal" }, { status: 500 });
    }
  };
}
