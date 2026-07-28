// ---------------------------------------------------------------------------
// Transactional SMS via Twilio (Messaging API — no SDK dependency).
// Credential-gated: with TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN +
// TWILIO_FROM_NUMBER set, real texts go out. Without them, callers fall back
// to showing the code (bridge for testing) — same pattern as src/server/email.ts.
//
// Uses the plain Messaging API (POST /2010-04-01/Accounts/{SID}/Messages.json),
// not Twilio Verify — Verify would require provisioning a separate service in
// the console. We reuse the app's existing OTP flow (otp_codes table) end to
// end; only the delivery channel changes.
// ---------------------------------------------------------------------------

export function isSmsConfigured(): boolean {
  return !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_FROM_NUMBER;
}

/** Sends the login code by SMS. Returns true on success, false on any failure. */
export async function sendOtpSms(phoneE164: string, code: string): Promise<boolean> {
  if (!isSmsConfigured()) return false;

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: phoneE164,
        From: from,
        Body: `Your Neo Nature login code is ${code}. It expires in 10 minutes.`,
      }),
    });
    if (!res.ok) {
      console.error(`[sms] Twilio failed ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[sms] send threw:", e);
    return false;
  }
}
