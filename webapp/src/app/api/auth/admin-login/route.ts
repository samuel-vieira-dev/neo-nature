import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createAdminSession } from "@/server/session";

// Fixed admin email — the account gate is the password, not the email address.
const ADMIN_EMAIL = "admin@neonature.com";

const bodySchema = z.object({ password: z.string().min(1) });

// Password-only admin login (no OTP). Finds or creates the admin@neonature.com
// user (already onboarded) and opens the SEPARATE admin session (nn_admin
// cookie) — independent from the customer app session.
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  // The password lives ONLY in the environment — never hardcoded, so it can be
  // rotated without a deploy and never lands in the repo.
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    console.error("[admin-login] ADMIN_PASSWORD is not set — admin login disabled");
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  if (parsed.data.password !== expected) {
    return Response.json({ error: "wrong_password" }, { status: 401 });
  }

  let user = await db.query.users.findFirst({ where: eq(users.email, ADMIN_EMAIL) });
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        email: ADMIN_EMAIL,
        name: "Admin",
        fullName: "Admin",
        onboardedAt: new Date(),
      })
      .returning();
  }

  await createAdminSession(user.id);
  return Response.json({ ok: true });
}
