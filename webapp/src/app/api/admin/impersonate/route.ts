import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, adminActionLogs } from "@/db/schema";
import { withAdmin } from "@/server/admin";
import { createImpersonationSession } from "@/server/session";

const schema = z.object({ userId: z.string().min(1) });

// Logs the admin into the customer's own app session (15 min, see
// createImpersonationSession) and records the action for audit purposes.
// Doesn't touch the admin's own nn_admin cookie — returning to /admin needs
// no re-login.
export const POST = withAdmin(async (admin, req: Request) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const target = await db.query.users.findFirst({ where: eq(users.id, parsed.data.userId), columns: { id: true, name: true, email: true } });
  if (!target) return Response.json({ error: "not_found" }, { status: 404 });

  await createImpersonationSession(target.id, admin.id);
  await db.insert(adminActionLogs).values({
    adminUserId: admin.id,
    action: "impersonate",
    targetUserId: target.id,
    metadata: { targetName: target.name, targetEmail: target.email },
  });

  return Response.json({ ok: true });
});
