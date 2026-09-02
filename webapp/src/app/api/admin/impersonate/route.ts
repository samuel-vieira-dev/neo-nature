import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, orders, type User } from "@/db/schema";
import { withAdmin, logAdminAction } from "@/server/admin";
import { createImpersonationSession } from "@/server/session";
import { linkOrdersToUser } from "@/server/buygoods";
import { findOrProvisionAccount } from "@/server/leads";

const schema = z
  .object({ userId: z.string().min(1).optional(), email: z.string().min(1).optional() })
  .refine((d) => d.userId || d.email, { message: "need_identifier" });

/**
 * Resolves the account behind a CRM row that has no app user yet ("lead").
 * The phone comes off the customer's latest order (BuyGoods/Konnektive don't
 * hand us a phone directly here — only the email the CRM row is keyed on);
 * account lookup/provisioning itself is shared with the 360 "Open ticket"
 * flow — see src/server/leads.ts.
 */
async function resolveLead(email: string): Promise<{ user: User; provisioned: boolean } | null> {
  const key = email.toLowerCase().trim();
  const order = await db.query.orders.findFirst({
    where: eq(orders.email, key),
    orderBy: [desc(orders.placedAt)],
  });
  if (!order) return null;
  return findOrProvisionAccount({ email: key, phone: order.customerPhoneE164 });
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

  // Bring the account up to date exactly as a real login would: link any
  // orders matching this email/phone and copy name/address off the latest one.
  // Accounts provisioned before hydration existed — or that simply never
  // logged in again — still have an empty name, and the preview has to show
  // what the customer actually sees.
  await linkOrdersToUser(target.id, { email: target.email, phone: target.phone });
  const fresh = (await db.query.users.findFirst({ where: eq(users.id, target.id) })) ?? target;

  await createImpersonationSession(fresh.id, admin.id);
  await logAdminAction(admin, provisioned ? "impersonate_lead" : "impersonate", {
    targetUserId: fresh.id,
    metadata: { targetName: fresh.name, targetEmail: fresh.email, provisioned },
  });

  return Response.json({ ok: true });
}, "customers:impersonate");
