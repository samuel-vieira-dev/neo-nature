import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

// ---------------------------------------------------------------------------
// Shared account resolution for admin flows that act on a customer who may
// not have an app account yet ("View as customer" — src/app/api/admin/
// impersonate/route.ts — and opening a support ticket from the 360 — see
// src/app/api/admin/customers/[id]/tickets/route.ts). Provisioning creates
// the same bare `users` row an OTP login would have created: no onboarding
// answers are invented, so if the customer later signs in for real they get
// the genuine onboarding.
// ---------------------------------------------------------------------------

/**
 * Finds the account matching `phone` (preferred, since customers sign in
 * with the phone they bought with) or `email`; provisions a bare row when
 * neither exists. Returns null when there's no email and no phone to key on.
 */
export async function findOrProvisionAccount({
  email,
  phone,
}: {
  email?: string | null;
  phone?: string | null;
}): Promise<{ user: User; provisioned: boolean } | null> {
  const key = email ? email.toLowerCase().trim() : null;
  if (!key && !phone) return null;

  const existing =
    (phone ? await db.query.users.findFirst({ where: eq(users.phone, phone) }) : null) ??
    (key ? await db.query.users.findFirst({ where: eq(users.email, key) }) : null);
  if (existing) return { user: existing, provisioned: false };

  const [user] = await db.insert(users).values({ id: crypto.randomUUID(), email: key, phone: phone ?? null }).returning();
  return { user, provisioned: true };
}
