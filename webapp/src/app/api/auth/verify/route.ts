import { z } from "zod";
import { and, eq, gt, isNull, desc } from "drizzle-orm";
import { db } from "@/db";
import { otpCodes, users } from "@/db/schema";
import { createSession } from "@/server/session";
import { linkOrdersToUser } from "@/server/buygoods";

const bodySchema = z.object({ email: z.string().email(), code: z.string().min(4).max(8) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const email = parsed.data.email.toLowerCase().trim();
  const code = parsed.data.code.trim();

  const otp = await db.query.otpCodes.findFirst({
    where: and(
      eq(otpCodes.email, email),
      eq(otpCodes.code, code),
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
      .values({ id, email, name: name.charAt(0).toUpperCase() + name.slice(1), fullName: name })
      .returning();
  }

  // link any orders that arrived (via BuyGoods) before this account existed
  await linkOrdersToUser(user.id, email);

  await createSession(user.id);
  return Response.json({ ok: true, onboarded: !!user.onboardedAt });
}
