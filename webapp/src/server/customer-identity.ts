// ---------------------------------------------------------------------------
// Canonical customer identity (Customer 360).
//
// Two jobs live here:
//
// 1. The LIVE resolver — resolveCustomerForOrder / resolveCustomerForUser —
//    called from the ingest paths (buygoods.ts, konnektive.ts) and from
//    linkOrdersToUser. It finds-or-creates the `customers` row for an
//    order/user and stamps `customer_id`. Point queries only (orders_email /
//    orders_phone / orders_bg_user indexes + users uniques) — it runs on the
//    webhook path and must never scan tables.
//
// 2. The LEGACY clustering — clusterByLegacyRules — a faithful extraction of
//    how crm.ts historically grouped customers in memory. The backfill script
//    (scripts/backfill-customers.ts) and its validation both use THIS function,
//    so "the backfill matches the old CRM" holds by construction.
//
// Invariants:
// - `customer_id` is sticky: once set on an order/user it is never reassigned
//   automatically. No automatic merging of two existing customers, ever —
//   wrong links are fixed manually via customers.merged_into_id.
// - Precedence when candidates disagree: email > BuyGoods pair > phone.
//   Email is the strong key (it's how the CRM always clustered); phone is the
//   weak one (families share phones). Disagreements are logged, not merged.
// - A resolver failure must never fail the webhook: callers wrap in try/catch;
//   a row left with customer_id NULL is picked up by the crm.ts fallback and
//   by re-running the backfill.
// ---------------------------------------------------------------------------

import { randomUUID } from "crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customers, orders, users, type Order, type User } from "@/db/schema";

// -------------------------------- pure core --------------------------------

export type IdentityKeys = {
  /** Lowercased/trimmed; null when the source carries no email. */
  email: string | null;
  /** E.164; null when unparseable/absent. */
  phoneE164: string | null;
  /** BuyGoods (account_id, user_id) pair — only the PAIR identifies a customer. */
  bgPair: { accountId: string; userId: string } | null;
};

export type Candidates = {
  byEmail: string | null;
  byBgPair: string | null;
  byPhone: string | null;
};

export type IdentityDecision =
  | { action: "attach"; customerId: string; conflicts: string[] }
  | { action: "create" };

/** Pure merge policy: email > BuyGoods pair > phone; never merge, only attach. */
export function decideCustomer(c: Candidates): IdentityDecision {
  const picked = c.byEmail ?? c.byBgPair ?? c.byPhone;
  if (!picked) return { action: "create" };
  const conflicts = [
    ...new Set([c.byEmail, c.byBgPair, c.byPhone].filter((id): id is string => !!id && id !== picked)),
  ];
  return { action: "attach", customerId: picked, conflicts };
}

// --------------------------- legacy clustering -----------------------------

export type LegacyOrderKeys = Pick<
  Order,
  "id" | "email" | "customerPhoneE164" | "customerName" | "placedAt"
>;
export type LegacyUserKeys = Pick<User, "id" | "email" | "phone" | "fullName">;

export type LegacyCluster = {
  /** email (lowercase) | phone (E.164) | user id — same keys crm.ts used. */
  key: string;
  email: string | null;
  phone: string | null;
  name: string;
  orderIds: string[];
  userIds: string[];
};

/**
 * Reproduces the historical crm.ts clustering: orders fold by lowercased email
 * (latest name/phone snapshot wins); users join by email, else by the phone of
 * an order paid with the same E.164 (SMS-only accounts), else key off the phone
 * itself, else the user id.
 *
 * Orders with NO email never entered the old CRM (`if (!o.email) continue`) —
 * they come back as `orphanOrders` for the backfill to place (by phone when
 * possible, else as solitary customers). One deliberate divergence: the old
 * phone→order lookup didn't require the matched order to have an email, which
 * could key a cluster off the empty string — we require an email on the match.
 */
export function clusterByLegacyRules(
  allOrders: LegacyOrderKeys[],
  allUsers: LegacyUserKeys[]
): { clusters: LegacyCluster[]; orphanOrders: LegacyOrderKeys[] } {
  const sorted = [...allOrders].sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());
  const map = new Map<string, LegacyCluster>();
  const get = (key: string): LegacyCluster => {
    let c = map.get(key);
    if (!c) {
      c = { key, email: null, phone: null, name: "", orderIds: [], userIds: [] };
      map.set(key, c);
    }
    return c;
  };

  const orphanOrders: LegacyOrderKeys[] = [];
  for (const o of sorted) {
    if (!o.email) {
      orphanOrders.push(o);
      continue;
    }
    const c = get(o.email.toLowerCase());
    c.email = c.key;
    c.orderIds.push(o.id);
    if (o.customerName) c.name = o.customerName;
    if (o.customerPhoneE164) c.phone = o.customerPhoneE164;
  }

  for (const u of allUsers) {
    let key: string | null = u.email ? u.email.toLowerCase() : null;
    if (!key && u.phone) {
      const orderMatch = sorted.find((o) => o.customerPhoneE164 === u.phone && o.email);
      key = orderMatch ? orderMatch.email.toLowerCase() : u.phone;
    }
    if (!key) key = u.id;

    const c = get(key);
    c.userIds.push(u.id);
    if (!c.name && u.fullName) c.name = u.fullName;
    if (!c.phone && u.phone) c.phone = u.phone;
    if (!c.email && u.email) c.email = u.email.toLowerCase();
  }

  return { clusters: [...map.values()], orphanOrders };
}

// ------------------------------- DB resolver -------------------------------

/** 2–6 point queries over existing indexes; never a table scan. */
export async function findCandidates(keys: IdentityKeys): Promise<Candidates> {
  const [byEmail, byBgPair, byPhone] = await Promise.all([
    (async () => {
      if (!keys.email) return null;
      const c = await db.query.customers.findFirst({
        where: eq(customers.primaryEmail, keys.email),
        columns: { id: true },
      });
      if (c) return c.id;
      const o = await db.query.orders.findFirst({
        where: and(eq(orders.email, keys.email), isNotNull(orders.customerId)),
        columns: { customerId: true },
      });
      return o?.customerId ?? null;
    })(),
    (async () => {
      if (!keys.bgPair) return null;
      const o = await db.query.orders.findFirst({
        where: and(
          eq(orders.buygoodsAccountId, keys.bgPair.accountId),
          eq(orders.buygoodsUserId, keys.bgPair.userId),
          isNotNull(orders.customerId)
        ),
        columns: { customerId: true },
      });
      return o?.customerId ?? null;
    })(),
    (async () => {
      if (!keys.phoneE164) return null;
      const u = await db.query.users.findFirst({
        where: eq(users.phone, keys.phoneE164),
        columns: { customerId: true },
      });
      if (u?.customerId) return u.customerId;
      const c = await db.query.customers.findFirst({
        where: eq(customers.primaryPhone, keys.phoneE164),
        columns: { id: true },
      });
      if (c) return c.id;
      const o = await db.query.orders.findFirst({
        where: and(eq(orders.customerPhoneE164, keys.phoneE164), isNotNull(orders.customerId)),
        columns: { customerId: true },
      });
      return o?.customerId ?? null;
    })(),
  ]);
  return { byEmail, byBgPair, byPhone };
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505";
}

/**
 * Find-or-create the customer for a set of identity keys, enriching the row
 * with anything it's missing (phone, name). Handles the webhook×webhook race
 * on primary_email via one retry after a unique violation.
 */
async function findOrCreateCustomer(keys: IdentityKeys, snapshot: { name: string }, context: string): Promise<string> {
  const decision = decideCustomer(await findCandidates(keys));

  if (decision.action === "attach") {
    if (decision.conflicts.length > 0) {
      console.warn(
        `[identity] conflict ${context}: attached to ${decision.customerId}, ignored ${decision.conflicts.join(", ")}`
      );
    }
    const row = await db.query.customers.findFirst({ where: eq(customers.id, decision.customerId) });
    if (row) {
      const patch: Partial<typeof customers.$inferInsert> = {};
      if (!row.primaryPhone && keys.phoneE164) patch.primaryPhone = keys.phoneE164;
      if (!row.name && snapshot.name) patch.name = snapshot.name;
      // primaryEmail is never overwritten; a second email stays discoverable
      // through the order rows themselves (findCandidates reads those too).
      if (!row.primaryEmail && keys.email) patch.primaryEmail = keys.email;
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = new Date();
        await db.update(customers).set(patch).where(eq(customers.id, row.id));
      }
    }
    return decision.customerId;
  }

  const id = randomUUID();
  try {
    await db.insert(customers).values({
      id,
      primaryEmail: keys.email,
      primaryPhone: keys.phoneE164,
      name: snapshot.name,
    });
    return id;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // Two webhooks for a brand-new customer raced; the other one won. Re-find.
    const retry = decideCustomer(await findCandidates(keys));
    if (retry.action === "attach") return retry.customerId;
    throw e;
  }
}

/**
 * Stamp customer_id on an order (sticky — only fills NULL). Callers wrap in
 * try/catch: identity resolution must never fail the webhook.
 */
export async function resolveCustomerForOrder(
  orderId: string,
  keys: IdentityKeys,
  snapshot: { name: string }
): Promise<string> {
  const customerId = await findOrCreateCustomer(keys, snapshot, `order=${orderId}`);
  await db
    .update(orders)
    .set({ customerId })
    .where(and(eq(orders.id, orderId), isNull(orders.customerId)));
  return customerId;
}

/** Stamp customer_id on an app user (sticky — only fills NULL). */
export async function resolveCustomerForUser(
  user: Pick<User, "id" | "email" | "phone" | "fullName" | "customerId">
): Promise<string> {
  if (user.customerId) return user.customerId;
  const keys: IdentityKeys = {
    email: user.email ? user.email.toLowerCase().trim() : null,
    phoneE164: user.phone ?? null,
    bgPair: null,
  };
  const customerId = await findOrCreateCustomer(keys, { name: user.fullName }, `user=${user.id}`);
  await db
    .update(users)
    .set({ customerId })
    .where(and(eq(users.id, user.id), isNull(users.customerId)));
  return customerId;
}
