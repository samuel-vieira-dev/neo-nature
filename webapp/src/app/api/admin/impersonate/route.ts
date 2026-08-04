import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, orders, adminActionLogs, type User } from "@/db/schema";
import { withAdmin } from "@/server/admin";
import { createImpersonationSession } from "@/server/session";
import { linkOrdersToUser } from "@/server/buygoods";

const schema = z
  .object({ userId: z.string().min(1).optional(), email: z.string().min(1).optional() })
  .refine((d) => d.userId || d.email, { message: "need_identifier" });

/**
 * Resolves the account behind a CRM row that has no app user yet ("lead").
 * Creates the same row the OTP login would have created — keyed on the phone
 * and email BuyGoods gave us — then links their orders and copies name/address
 * off the latest one. Nothing is faked: onboarding is skipped by the session
 * (see /api/me `impersonating`), not by writing answers the customer didn't give,
 * so if they later sign in for real they still get the genuine onboarding.
 */
async function resolveLead(email: string): Promise<{ user: User; provisioned: boolean } | null> {
  const key = email.toLowerCase().trim();
  const order = await db.query.orders.findFirst({
    where: eq(orders.email, key),
    orderBy: [desc(orders.placedAt)],
  });
  if (!order) return null;
  const phone = order.customerPhoneE164;

  const existing =
    (phone ? await db.query.users.findFirst({ where: eq(users.phone, phone) }) : null) ??
    (await db.query.users.findFirst({ where: eq(users.email, key) }));
  if (existing) return { user: existing, provisioned: false };

  const [user] = await db.insert(users).values({ id: crypto.randomUUID(), email: key, phone }).returning();
  await linkOrdersToUser(user.id, { email: key, phone }); // also hydrates name/address
  const hydrated = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  return { user: hydrated ?? user, provisioned: true };
}

// Opens the customer's own app session for the admin (15 min, see
// createImpersonationSession) and records the action for audit purposes.
// Doesn't touch the admin's own nn_admin cookie — returning to /admin needs
// no re-login.
export const POST = withAdmin(async (admin, req: Request) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const { userId, email } = parsed.data;
  const resolved = userId
    ? await db.query.users
        .findFirst({ where: eq(users.id, userId) })
        .then((u) => (u ? { user: u, provisioned: false } : null))
    : await resolveLead(email!);
  if (!resolved) return Response.json({ error: "not_found" }, { status: 404 });

  const { user: target, provisioned } = resolved;
  await createImpersonationSession(target.id, admin.id);
  await db.insert(adminActionLogs).values({
    adminUserId: admin.id,
    action: provisioned ? "impersonate_lead" : "impersonate",
    targetUserId: target.id,
    metadata: { targetName: target.name, targetEmail: target.email, provisioned },
  });

  return Response.json({ ok: true });
});
