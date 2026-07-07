import { z } from "zod";
import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { isDemoMode } from "@/server/session";

const bodySchema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_email" }, { status: 400 });

  const email = parsed.data.email.toLowerCase().trim();
  const code = String(Math.floor(100000 + Math.random() * 900000));

  await db.insert(otpCodes).values({
    email,
    code,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  // Phase 2: send via Resend/SES. In demo mode the code is returned so the
  // client can show it on screen ("check your email" is simulated).
  console.log(`[auth] OTP for ${email}: ${code}`);
  return Response.json({ ok: true, ...(isDemoMode() ? { demoCode: code } : {}) });
}
