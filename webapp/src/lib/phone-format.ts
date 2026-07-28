// ---------------------------------------------------------------------------
// Shared phone-number normalization (client + server). Customers now sign in
// with a phone number (SMS OTP) instead of email — this is the single place
// that turns "whatever the user typed" / "whatever BuyGoods sent" into E.164.
// ---------------------------------------------------------------------------

/** Loose E.164 check: "+" followed by 8–15 digits, first digit 1–9. */
export function isValidE164(s: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(s);
}

/**
 * Combines a country dial code (e.g. "+1") with a locally-typed number
 * (login form input) into E.164. Strips everything but digits from `local`
 * first. Returns null when the result isn't a plausible phone number.
 */
export function normalizePhone(dial: string, local: string): string | null {
  const digits = local.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  const candidate = `${dial}${digits}`;
  return isValidE164(candidate) ? candidate : null;
}

/**
 * Best-effort E.164 guess for phone numbers arriving from the BuyGoods IPN
 * (checkout is US-centric, so a bare 10-digit number is assumed +1).
 * Returns null when the input can't be turned into a valid E.164 number.
 */
export function normalizeIngestPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let candidate: string;
  if (digits.length === 10) candidate = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) candidate = `+${digits}`;
  else candidate = `+${digits}`;

  return isValidE164(candidate) ? candidate : null;
}
