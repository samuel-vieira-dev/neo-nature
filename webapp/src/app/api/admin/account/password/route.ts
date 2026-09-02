import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { withAdmin, logAdminAction } from "@/server/admin";
import { hashPassword, verifyPassword, passwordPolicyError } from "@/server/password";

// Any signed-in staff member may change their own password — no permission
// gate beyond "you're an admin". Editing other accounts' passwords goes
// through /api/admin/admins/[id] (admins:manage) instead.

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export const POST = withAdmin(async (admin, req: Request) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { currentPassword, newPassword } = parsed.data;

  if (!verifyPassword(currentPassword, admin.passwordHash)) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const policyError = passwordPolicyError(newPassword);
  if (policyError) return Response.json({ error: policyError }, { status: 400 });

  await db.update(adminUsers).set({ passwordHash: hashPassword(newPassword) }).where(eq(adminUsers.id, admin.id));
  await logAdminAction(admin, "password_change");

  return Response.json({ ok: true });
});
