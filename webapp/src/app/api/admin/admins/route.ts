import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { withAdmin, logAdminAction } from "@/server/admin";
import { hashPassword, passwordPolicyError } from "@/server/password";

// Never select passwordHash out to the client — every response from this
// route (and admins/[id]) is built from this column set.
const publicColumns = {
  id: adminUsers.id,
  email: adminUsers.email,
  name: adminUsers.name,
  role: adminUsers.role,
  active: adminUsers.active,
  lastLoginAt: adminUsers.lastLoginAt,
  createdAt: adminUsers.createdAt,
};

export const GET = withAdmin(async () => {
  const rows = await db.select(publicColumns).from(adminUsers).orderBy(asc(adminUsers.createdAt));
  return Response.json({ admins: rows });
}, "admins:manage");

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["admin", "cs"]),
  password: z.string().min(1),
});

export const POST = withAdmin(async (admin, req: Request) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { name, email, role, password } = parsed.data;

  const policyError = passwordPolicyError(password);
  if (policyError) return Response.json({ error: policyError }, { status: 400 });

  const existing = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });
  if (existing) return Response.json({ error: "email_taken" }, { status: 409 });

  const [row] = await db
    .insert(adminUsers)
    .values({
      id: crypto.randomUUID(),
      email,
      name,
      role,
      passwordHash: hashPassword(password),
      active: true,
      createdBy: admin.id,
    })
    .returning(publicColumns);

  await logAdminAction(admin, "admin.create", { targetUserId: row.id, metadata: { email, role } });

  return Response.json({ ok: true, admin: row }, { status: 201 });
}, "admins:manage");
