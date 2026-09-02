import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers, adminActionLogs, type AdminUser } from "@/db/schema";
import { adminSessionUserId, destroyAdminSession } from "./session";
import { hasPermission, permissionsFor, type Permission, type Role } from "./permissions";

// ---------------------------------------------------------------------------
// Admin authentication/authorization gate. Individual staff accounts live in
// `admin_users` (separate table from customer `users` — see schema.ts). The
// admin session cookie (nn_admin) carries only `uid`; role and `active` are
// re-read from the DB on every request in getAdminUser(), so a deactivated
// account or a role change take effect on the very next request, not on next
// login. Every admin route is wrapped in withAdmin(handler, permission) — the
// single central checkpoint for "can this staff member do this".
//
// Routes that let staff edit a customer/order field (customers:write,
// orders:address/orders:write) also add that field name to the row's
// `locked_fields` column, so a later webhook update never silently
// overwrites a manual correction — see src/server/field-locks.ts.
// ---------------------------------------------------------------------------

export type AdminContext = AdminUser & { role: Role; permissions: readonly Permission[] };

export async function getAdminUser(): Promise<AdminContext | null> {
  const uid = await adminSessionUserId();
  if (!uid) return null;
  const row = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, uid) });
  if (!row || !row.active) return null;
  const role = row.role as Role;
  return { ...row, role, permissions: permissionsFor(role) };
}

/** Asserts an admin session (and, if given, a permission), else throws a Response. */
export async function requireAdmin(permission?: Permission): Promise<AdminContext> {
  const admin = await getAdminUser();
  if (!admin) {
    await destroyAdminSession();
    throw Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (permission && !hasPermission(admin.role, permission)) {
    throw Response.json({ error: "no_permission", permission }, { status: 403 });
  }
  return admin;
}

/** Wraps an admin route handler. Pass the permission the route needs. */
export function withAdmin<T extends unknown[]>(
  handler: (admin: AdminContext, ...args: T) => Promise<Response>,
  permission?: Permission
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      const admin = await requireAdmin(permission);
      return await handler(admin, ...args);
    } catch (e) {
      if (e instanceof Response) return e;
      console.error("[admin-api]", e);
      return Response.json({ error: "internal" }, { status: 500 });
    }
  };
}

/** Audit helper — every admin write goes through here. */
export async function logAdminAction(
  admin: AdminContext,
  action: string,
  opts: { targetUserId?: string | null; metadata?: Record<string, unknown> } = {}
) {
  await db.insert(adminActionLogs).values({
    adminUserId: admin.id,
    action,
    targetUserId: opts.targetUserId ?? null,
    metadata: { adminEmail: admin.email, ...opts.metadata },
  });
}
