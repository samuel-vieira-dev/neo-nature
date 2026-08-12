import { z } from "zod";
import { and, eq, gt, isNull, desc } from "drizzle-orm";
import { db } from "@/db";
import { otpCodes, users } from "@/db/schema";
import { createSession } from "@/server/session";
import { linkOrdersToUser } from "@/server/buygoods";
import { isValidE164 } from "@/lib/phone-format";

const bodySchema = z.object({ phone: z.string().refine(isValidE164, "invalid_phone"), code: z.string().min(4).max(8) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const phone = parsed.data.phone;
  const code = parsed.data.code.trim();

  const otp = await db.query.otpCodes.findFirst({
    where: and(
      eq(otpCodes.phone, phone),
      eq(otpCodes.code, code),
      gt(otpCodes.expiresAt, new Date()),
      isNull(otpCodes.usedAt)
    ),
    orderBy: [desc(otpCodes.id)],
  });
  if (!otp) return Response.json({ error: "invalid_code" }, { status: 401 });

  await db.update(otpCodes).set({ usedAt: new Date() }).where(eq(otpCodes.id, otp.id));

  let user = await db.query.users.findFirst({ where: eq(users.phone, phone) });
  if (!user) {
    const id = crypto.randomUUID();
    // SMS sign-ups have no name yet — onboarding collects a first name.
    [user] = await db.insert(users).values({ id, phone }).returning();
  }

  // link any orders that arrived (via BuyGoods) before this account existed
  await linkOrdersToUser(user.id, { email: user.email, phone: user.phone });

  // Marks the account as genuinely used by the customer (the CRM's "App" tag).
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  await createSession(user.id);
  return Response.json({ ok: true, onboarded: !!user.onboardedAt });
}
