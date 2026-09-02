// ---------------------------------------------------------------------------
// Anti-webhook field locking (plan §2.1). Editing a field in the admin panel
// locks it: the name goes into `locked_fields` (jsonb string[]) on the row,
// and the webhook ingests (buygoods.ts, konnektive.ts) skip that column on
// UPDATE — a manual correction is never overwritten by the platform feed.
// "Unlock" removes the name so the next webhook writes it again.
// ---------------------------------------------------------------------------

/** Column keys each lock name protects on `orders` (a lock on the phone also
 *  protects its derived E.164 column). */
export const ORDER_LOCK_COLUMNS: Record<string, readonly string[]> = {
  address: ["address"],
  email: ["email"],
  customerName: ["customerName"],
  customerPhone: ["customerPhone", "customerPhoneE164"],
  shippingTrackingId: ["shippingTrackingId"],
};

/** Returns a copy of `patch` without the columns protected by `locked`. */
export function stripLockedFields<T extends Record<string, unknown>>(
  patch: T,
  locked: readonly string[] | null | undefined,
  columnsFor: Record<string, readonly string[]> = ORDER_LOCK_COLUMNS
): Partial<T> {
  if (!locked?.length) return { ...patch };
  const blocked = new Set(locked.flatMap((name) => columnsFor[name] ?? [name]));
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(patch)) if (!blocked.has(k)) (out as Record<string, unknown>)[k] = v;
  return out;
}
