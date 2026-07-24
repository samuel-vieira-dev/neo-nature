import { requireUser } from "./session";
import type { User } from "@/db/schema";

// Admin allowlist. Override with ADMIN_EMAILS (comma-separated) on Railway.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "admin@neonature.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

/** Loads the current user and asserts they're an admin, else throws a Response. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser(); // throws 401 when not signed in
  if (!isAdminEmail(user.email)) throw Response.json({ error: "forbidden" }, { status: 403 });
  return user;
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
