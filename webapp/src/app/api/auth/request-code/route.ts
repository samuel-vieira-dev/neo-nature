import { z } from "zod";
import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { isValidE164, normalizeIngestPhone } from "@/lib/phone-format";
import { isSmsConfigured, sendOtpSms } from "@/server/sms";

const bodySchema = z.object({ phone: z.string().min(8).max(24) });

/** 4-digit code — short enough to read off a lock-screen preview and retype. */
function generateCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_phone" }, { status: 400 });

  // Re-normalize server-side so an older client that still glued "+44" onto a
  // local "07713…" number gets the trunk 0 dropped here (libphonenumber).
  const phone = normalizeIngestPhone(parsed.data.phone) ?? parsed.data.phone;
  if (!isValidE164(phone)) return Response.json({ error: "invalid_phone" }, { status: 400 });

  const code = generateCode();

  await db.insert(otpCodes).values({
    phone,
    code,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  if (isSmsConfigured()) {
    const sent = await sendOtpSms(phone, code);
    // Don't leak the code in production — surface a failure so Twilio/account
    // issues are caught instead of silently swallowed. The Twilio error code
    // is returned so the login screen can say something more useful than
    // "something went wrong" (21211 bad number vs 21612/21408 route blocked).
    if (!sent.ok) {
      return Response.json({ error: "sms_failed", twilioCode: sent.code ?? null, phone }, { status: 502 });
    }
    return Response.json({ ok: true, phone });
  }

  // No SMS provider configured — return the code so testers can sign in. Set
  // TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER (or a
  // TWILIO_MESSAGING_SERVICE_SID) to switch to real SMS delivery. Local dev
  // intentionally has no Twilio creds.
  console.log(`[auth] OTP for ${phone}: ${code} (SMS not configured)`);
  return Response.json({ ok: true, phone, devCode: code });
}
