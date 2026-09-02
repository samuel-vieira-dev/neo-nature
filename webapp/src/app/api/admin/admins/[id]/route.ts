import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminUsers, type AdminUser } from "@/db/schema";
import { withAdmin, logAdminAction } from "@/server/admin";
import { hashPassword, passwordPolicyError } from "@/server/password";

const publicColumns = {
  id: adminUsers.id,
  email: adminUsers.email,
  name: adminUsers.name,
  role: adminUsers.role,
  active: adminUsers.active,
  lastLoginAt: adminUsers.lastLoginAt,
  createdAt: adminUsers.createdAt,
};

function toPublic(u: AdminUser) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, active: u.active, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt };
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["admin", "cs"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(1).optional(),
});

export const PATCH = withAdmin(async (admin, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { name, role, active, password } = parsed.data;

  const target = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, id) });
  if (!target) return Response.json({ error: "not_found" }, { status: 404 });

  const isSelf = id === admin.id;
  const demotesOwnRole = role !== undefined && role !== "admin" && target.role === "admin";

  // Deactivating your own account would end the very session making this
  // request — block it unconditionally, even if other admins exist. This is
  // checked before the last_admin case below so the more specific,
  // always-applicable rule wins.
  if (isSelf && active === false) {
    return Response.json({ error: "cannot_change_self" }, { status: 400 });
  }

  // Would this change drop the number of active admins to zero? Checked for
  // any target (not just self) — e.g. another admin deactivating the last
  // remaining admin is blocked the same way.
  const losesAdminStatus = target.role === "admin" && target.active && (active === false || demotesOwnRole);
  if (losesAdminStatus) {
    const otherActiveAdmins = await db.query.adminUsers.findMany({
      where: and(eq(adminUsers.role, "admin"), eq(adminUsers.active, true), ne(adminUsers.id, id)),
    });
    if (otherActiveAdmins.length === 0) {
      return Response.json({ error: "last_admin" }, { status: 400 });
    }
  }

  // Self-demotion when other admins remain to cover for it (the last_admin
  // branch above already handled the alternative, where none remain).
  if (isSelf && demotesOwnRole) {
    return Response.json({ error: "cannot_change_self" }, { status: 400 });
  }

  const patch: Partial<typeof adminUsers.$inferInsert> = {};
  const changed: string[] = [];
  if (name !== undefined && name !== target.name) {
    patch.name = name;
    changed.push("name");
  }
  if (role !== undefined && role !== target.role) {
    patch.role = role;
    changed.push("role");
  }
  if (active !== undefined && active !== target.active) {
    patch.active = active;
    changed.push("active");
  }
  if (password !== undefined) {
    const policyError = passwordPolicyError(password);
    if (policyError) return Response.json({ error: policyError }, { status: 400 });
    patch.passwordHash = hashPassword(password);
    changed.push("password");
  }

  if (changed.length === 0) {
    return Response.json({ ok: true, admin: toPublic(target) });
  }

  const [row] = await db.update(adminUsers).set(patch).where(eq(adminUsers.id, id)).returning(publicColumns);
  // Never log the password itself — just that it changed.
  await logAdminAction(admin, "admin.update", { targetUserId: id, metadata: { changed } });

  return Response.json({ ok: true, admin: row });
}, "admins:manage");
