import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Admin password hashing. scrypt (Node built-in, no new dependency), random
// 16-byte salt per password, timing-safe comparison. Stored as
// "scrypt$<salt_hex>$<hash_hex>" so the params can change later without
// breaking old hashes (none exist yet, but the format is future-proofed).
// ---------------------------------------------------------------------------

const N = 16384,
  r = 8,
  p = 1,
  KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN, { N, r, p });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length, { N, r, p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Minimum policy: 10+ chars. Keep it simple; the team is small. */
export function passwordPolicyError(plain: string): string | null {
  return plain.length >= 10 ? null : "Password must be at least 10 characters";
}
