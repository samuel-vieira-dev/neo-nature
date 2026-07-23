import { z } from "zod";
import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { isEmailConfigured, sendOtpEmail } from "@/server/email";

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

  if (isEmailConfigured()) {
    await sendOtpEmail(email, code);
    return Response.json({ ok: true });
  }

  // No email provider yet — return the code so testers can sign in. Set
  // RESEND_API_KEY + EMAIL_FROM to switch to real email delivery.
  console.log(`[auth] OTP for ${email}: ${code} (email not configured)`);
  return Response.json({ ok: true, devCode: code });
}
