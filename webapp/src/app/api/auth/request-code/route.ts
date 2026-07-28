import { z } from "zod";
import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { isValidE164 } from "@/lib/phone-format";
import { isSmsConfigured, sendOtpSms } from "@/server/sms";

const bodySchema = z.object({ phone: z.string().refine(isValidE164, "invalid_phone") });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_phone" }, { status: 400 });

  const phone = parsed.data.phone;
  const code = String(Math.floor(100000 + Math.random() * 900000));

  await db.insert(otpCodes).values({
    phone,
    code,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  if (isSmsConfigured()) {
    const sent = await sendOtpSms(phone, code);
    // Don't leak the code in production — surface a failure so Twilio/account
    // issues are caught instead of silently swallowed.
    if (!sent) return Response.json({ error: "sms_failed" }, { status: 502 });
    return Response.json({ ok: true });
  }

  // No SMS provider configured — return the code so testers can sign in. Set
  // TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER to switch to real
  // SMS delivery. Local dev intentionally has no Twilio creds.
  console.log(`[auth] OTP for ${phone}: ${code} (SMS not configured)`);
  return Response.json({ ok: true, devCode: code });
}
