// ---------------------------------------------------------------------------
// Transactional SMS via Twilio (Messaging API — no SDK dependency).
// Credential-gated: with TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN and a sender
// (TWILIO_MESSAGING_SERVICE_SID and/or TWILIO_FROM_NUMBER) set, real texts go
// out. Without them, callers fall back to showing the code (bridge for
// testing) — same pattern as src/server/email.ts.
//
// Uses the plain Messaging API (POST /2010-04-01/Accounts/{SID}/Messages.json),
// not Twilio Verify — Verify would require provisioning a separate service in
// the console. We reuse the app's existing OTP flow (otp_codes table) end to
// end; only the delivery channel changes.
//
// Sender selection — customers are worldwide, and a US long code can't text
// every country (the UK, for one, rejects it: Twilio error 21612 "cannot be
// sent with the current combination of To/From"). Three knobs, in order:
//   TWILIO_MESSAGING_SERVICE_SID  preferred — a Messaging Service whose sender
//                                 pool holds the US number + an alphanumeric
//                                 sender ("NeoNature"); Twilio picks the right
//                                 one per destination country on its own.
//   TWILIO_ALPHA_SENDER_ID        alphanumeric sender used directly for non-US
//                                 destinations (and as the retry when the
//                                 number is refused). Not valid for +1.
//   TWILIO_FROM_NUMBER            the US long code; always used for +1.
// ---------------------------------------------------------------------------

export function isSmsConfigured(): boolean {
  return (
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    (!!process.env.TWILIO_FROM_NUMBER || !!process.env.TWILIO_MESSAGING_SERVICE_SID)
  );
}

export type SmsResult = { ok: true; sid?: string; sender: string } | { ok: false; code?: number; message: string };

type Sender = { label: string; params: Record<string, string> };

/**
 * Ordered senders to try for a destination. The first that Twilio accepts
 * wins; a 21612 (route not allowed for this To/From pair) moves on to the
 * next, anything else stops — retrying a bad number or an unconfigured region
 * with a different sender wouldn't help.
 */
export function senderCandidates(phoneE164: string, env: NodeJS.ProcessEnv = process.env): Sender[] {
  const ms = env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const from = env.TWILIO_FROM_NUMBER?.trim();
  const alpha = env.TWILIO_ALPHA_SENDER_ID?.trim();
  const isNanp = phoneE164.startsWith("+1"); // US/Canada/Caribbean: alpha senders not allowed

  const out: Sender[] = [];
  if (ms) out.push({ label: `service:${ms}`, params: { MessagingServiceSid: ms } });
  if (isNanp) {
    if (from) out.push({ label: `number:${from}`, params: { From: from } });
  } else {
    if (alpha) out.push({ label: `alpha:${alpha}`, params: { From: alpha } });
    if (from) out.push({ label: `number:${from}`, params: { From: from } });
  }
  return out;
}

/** Twilio error codes after which trying another sender can still succeed. */
const RETRY_WITH_OTHER_SENDER = new Set([21612, 21606, 21659]);

/** Sends the login code by SMS, trying each eligible sender in turn. */
export async function sendOtpSms(phoneE164: string, code: string): Promise<SmsResult> {
  if (!isSmsConfigured()) return { ok: false, message: "sms_not_configured" };

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const body = `Your Neo Nature login code is ${code}. It expires in 10 minutes.`;

  let last: SmsResult = { ok: false, message: "no_sender_configured" };
  for (const sender of senderCandidates(phoneE164)) {
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: phoneE164, Body: body, ...sender.params }),
      });
      const json = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
      if (res.ok) return { ok: true, sid: json.sid, sender: sender.label };

      last = { ok: false, code: json.code, message: json.message ?? `HTTP ${res.status}` };
      console.error(
        `[sms] Twilio refused (${sender.label} → ${phoneE164}) ${res.status} code=${json.code ?? "?"}: ${(json.message ?? "").slice(0, 200)}`
      );
      if (!json.code || !RETRY_WITH_OTHER_SENDER.has(json.code)) break;
    } catch (e) {
      console.error(`[sms] send threw (${sender.label}):`, e);
      last = { ok: false, message: e instanceof Error ? e.message : "network_error" };
      break;
    }
  }
  return last;
}
