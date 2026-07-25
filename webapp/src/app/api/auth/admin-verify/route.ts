import { z } from "zod";
import { and, eq, gt, isNull, desc } from "drizzle-orm";
import { db } from "@/db";
import { otpCodes, users } from "@/db/schema";
import { createAdminSession } from "@/server/session";
import { isAdminEmail } from "@/server/admin";

const bodySchema = z.object({ email: z.string().email(), code: z.string().min(4).max(8) });

// Verifies an OTP for an admin email and opens the SEPARATE admin session
// (nn_admin cookie) — independent from the customer app session.
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const email = parsed.data.email.toLowerCase().trim();
  if (!isAdminEmail(email)) return Response.json({ error: "not_admin" }, { status: 403 });

  const otp = await db.query.otpCodes.findFirst({
    where: and(
      eq(otpCodes.email, email),
      eq(otpCodes.code, parsed.data.code.trim()),
      gt(otpCodes.expiresAt, new Date()),
      isNull(otpCodes.usedAt)
    ),
    orderBy: [desc(otpCodes.id)],
  });
  if (!otp) return Response.json({ error: "invalid_code" }, { status: 401 });
  await db.update(otpCodes).set({ usedAt: new Date() }).where(eq(otpCodes.id, otp.id));

  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    const id = crypto.randomUUID();
    const name = email.split("@")[0];
    [user] = await db
      .insert(users)
      .values({ id, email, name: name.charAt(0).toUpperCase() + name.slice(1), fullName: name, onboardedAt: new Date() })
      .returning();
  }

  await createAdminSession(user.id);
  return Response.json({ ok: true });
}
