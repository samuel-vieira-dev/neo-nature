import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, users } from "@/db/schema";
import { notifyUser } from "@/server/push";
import { normalizeIngestPhone } from "@/lib/phone-format";
import { firstNameOf } from "@/lib/name";
import { resolveCustomerForOrder, resolveCustomerForUser } from "@/server/customer-identity";
import { invalidateCustomersCache } from "@/server/crm";
import { stripLockedFields } from "@/server/field-locks";

// ---------------------------------------------------------------------------
// BuyGoods IPN ingestion. BuyGoods POSTs form-urlencoded order events to
// /webhook-buygoods-info (and duplicates the same fields on the query string).
// We upsert an order keyed by order_id_global, matched to an app user by email.
//
// BuyGoods DOES send a carrier tracking number on fulfillment — the
// shipping_tracking_id field (e.g. "GFUS01065804546499") — despite this
// comment previously claiming otherwise. See buildTrackingUrl in
// src/lib/tracking.ts for the customer-facing link.
//
// On update (never on insert of a brand-new order), the patch is run through
// stripLockedFields() against the existing row's `locked_fields` — any column
// an admin has manually corrected in the panel is skipped here so this feed
// can't clobber it back. See src/server/field-locks.ts.
// ---------------------------------------------------------------------------

export type Params = Record<string, string>;

/**
 * Merge query + body params; body is canonical, query fills gaps.
 *
 * BuyGoods posts form-urlencoded; since 2026-08-15 the client also relays
 * events through n8n, which posts the same fields as a JSON object (values
 * may arrive as numbers there — everything is coerced to string).
 */
export function parseIpnParams(query: Params, body: string): Params {
  const merged: Params = { ...query };
  if (body.trim().startsWith("{")) {
    try {
      const json = JSON.parse(body) as Record<string, unknown>;
      for (const [k, v] of Object.entries(json)) {
        if (v !== null && v !== undefined && typeof v !== "object") merged[k] = String(v);
      }
      return merged;
    } catch {
      // fall through — treat an unparseable body as form-encoded
    }
  }
  if (body) {
    const bodyParams = new URLSearchParams(body);
    for (const [k, v] of bodyParams) merged[k] = v;
  }
  return merged;
}

/** BuyGoods dates: "YYYY-MM-DD HH:MM:SS", "March 15, 2023", or zero-date. */
function parseDate(s: string | undefined): Date | null {
  if (!s || s.startsWith("0000-00-00")) return null;
  const iso = /^\d{4}-\d{2}-\d{2} /.test(s) ? s.replace(" ", "T") + "Z" : s;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function num(s: string | undefined): number {
  const n = parseFloat((s ?? "").replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

export type OrderStatus = "confirmed" | "shipped" | "canceled" | "refunded";

/**
 * Bank-initiated dispute, distinct from a merchant-issued refund but tracked
 * under the same "refunded" status. Also matches "chargeback alert" /
 * "Chargeback Alert-RDR" style action types (a forced pre-dispute refund) —
 * see the ago/2026 refund/chargeback analysis: those are reported as refunds
 * with Reason="Chargeback alert" but are chargeback-program events, not
 * ordinary merchant refunds. Exported for src/server/n8n-forward.ts, which
 * reuses this exact rule to route IPN fan-out to the right n8n webhook.
 */
export function isChargebackEvent(p: Params, eventTag: string | undefined): boolean {
  const action = (p.action_type || p.type || eventTag || "").toLowerCase();
  return action.includes("chargeback") || action.includes("dispute");
}

/**
 * Refund/chargeback amount, when the IPN reports one. Refunds are frequently
 * partial (customer keeps part of the order), so this must NOT default to the
 * full order total when absent — null means "amount unknown", not "full refund".
 * Field name is best-effort (no confirmed real capture with a refund amount
 * yet — check webhook_logs for the actual payload and adjust if this misses).
 */
function readRefundAmount(p: Params): string | null {
  const candidates = [num(p.refund_amount), num(p.amount_refunded), num(p.total_refunded)].filter((n) => n > 0);
  return candidates.length > 0 ? Math.max(...candidates).toFixed(2) : null;
}

/** Exported for src/server/n8n-forward.ts — see isChargebackEvent above. */
export function deriveStatus(p: Params, eventTag: string | undefined): OrderStatus {
  const action = (p.action_type || p.type || eventTag || "").toLowerCase();
  if (p.was_canceled === "1" || action.includes("cancel")) return "canceled";
  if (action.includes("refund") || isChargebackEvent(p, eventTag)) return "refunded";
  const shipped = Number(p.was_fulfilled || 0) >= 1 || /^shipped/i.test(p.shipping_status || "");
  return shipped ? "shipped" : "confirmed";
}

function buildTrackingSteps(
  status: OrderStatus,
  placed: Date,
  fulfilledAt: Date | null,
  shippingStatus: string | undefined,
  refundedAt?: Date | null
) {
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (status === "canceled") {
    return [
      { label: "Order confirmed", detail: "", date: fmt(placed), done: true },
      { label: "Order canceled", detail: "This order was canceled.", date: "", done: true, current: true },
    ];
  }
  if (status === "refunded") {
    return [
      { label: "Order confirmed", detail: "", date: fmt(placed), done: true },
      { label: "Refunded", detail: "Your refund has been processed.", date: refundedAt ? fmt(refundedAt) : "", done: true, current: true },
    ];
  }
  const shipped = status === "shipped";
  return [
    { label: "Order confirmed", detail: "We received your order", date: fmt(placed), done: true },
    { label: "Payment received", detail: "", date: fmt(placed), done: true },
    { label: "Preparing your order", detail: "", date: "", done: shipped, current: !shipped },
    {
      label: "Shipped",
      detail: shipped ? (shippingStatus || "On its way") : "",
      date: shipped && fulfilledAt ? fmt(fulfilledAt) : "",
      done: shipped,
      current: shipped,
    },
  ];
}

export type IngestResult =
  | { ok: true; status: "created" | "updated"; orderId?: string }
  | { ok: false; reason: string };

/**
 * Upserts an order from a parsed IPN. Idempotent by order_id_global.
 * Test orders (is_test=1) are ingested like any other — the team validates
 * BuyGoods test purchases against the real CRM.
 *
 * Note: RUNNING_OFFLINE=1 is NOT a test-ping indicator despite its name —
 * BuyGoods sends it on every IPN, including confirmed live sales.
 */
export async function ingestBuyGoodsEvent(
  p: Params,
  eventTag?: string,
  opts: { isReplay?: boolean } = {}
): Promise<IngestResult> {
  const isReplay = opts.isReplay === true;
  const bgId = p.order_id_global?.trim();
  if (!bgId) return { ok: false, reason: "missing order_id_global" };

  const email = (p.customer_emailaddress || "").toLowerCase().trim();
  const status = deriveStatus(p, eventTag);
  const placedAt = parseDate(p.rr_createdate) ?? parseDate(p.order_date) ?? new Date();
  const fulfilledAt = parseDate(p.date_fulfillment);
  const total = (p.total_amount_charged && num(p.total_amount_charged) > 0
    ? num(p.total_amount_charged)
    : num(p.total_clean)
  ).toFixed(2);
  const currency = p.currency || "USD";
  const shippingStatus = p.shipping_status || undefined;
  const shippingTrackingId = p.shipping_tracking_id?.trim() || undefined;
  const address = [p.shipping_address, p.shipping_city, p.shipping_state, p.shipping_zip, p.shipping_country]
    .filter(Boolean)
    .join(", ");
  const isChargeback = isChargebackEvent(p, eventTag);
  // Same values that go on the order_items row below, denormalized onto the
  // order. Not every event carries them (some n8n fulfillment payloads omit
  // product_codename), so an absent field must never blank out what we have.
  const productName = p.product_name?.trim() || p.product?.trim() || "";
  const productCodename = p.product_codename?.trim() || "";
  // "1" on upsell/downsell orders, "0" on the main sale; absent on some tails.
  const upsellFlag = p.flag_upsell === undefined || p.flag_upsell === "" ? null : p.flag_upsell === "1";

  // BuyGoods customer identity. account_id is missing from some event shapes
  // (e.g. cancel/refund tails) but recoverable from the buy_url they embed.
  // Only the PAIR identifies a customer — user_id ranges overlap across
  // accounts (see schema.ts), so both must be present or neither is stored.
  const bgAccountId =
    p.account_id?.trim() || p.buy_url?.match(/account_id(?:%253D|%3D|=)(\d+)/)?.[1] || null;
  const bgUserId = p.user_id?.trim() || null;
  const bgIdentity = bgAccountId && bgUserId ? { bgAccountId, bgUserId } : null;

  const existing = await db.query.orders.findFirst({ where: eq(orders.buygoodsOrderId, bgId) });

  // Stamp the first time we observe the transition; never overwrite once set.
  // Replays are historical, so "now" would be a lie — leave the stamp unset.
  const now = new Date();
  const refundedAt = existing?.refundedAt ?? (status === "refunded" && !isChargeback && !isReplay ? now : null);
  const chargebackAt = existing?.chargebackAt ?? (isChargeback && !isReplay ? now : null);
  const refundAmountValue = readRefundAmount(p);
  const refundAmount = existing?.refundAmount ?? (status === "refunded" && !isChargeback ? refundAmountValue : null);
  const chargebackAmount = existing?.chargebackAmount ?? (isChargeback ? refundAmountValue : null);
  const trackingSteps = buildTrackingSteps(status, placedAt, fulfilledAt, shippingStatus, isChargeback ? chargebackAt : refundedAt);

  // customer + attribution (for the admin CRM)
  const customerName =
    p.customer_name?.trim() ||
    [p.customer_firstname, p.customer_lastname].filter(Boolean).join(" ").trim() ||
    "";
  const customerPhone = p.customer_phone?.trim() || null;
  // International customers type local formats ("07713 480000"); the shipping
  // country is the context that makes those parseable into E.164.
  const customerPhoneE164 = normalizeIngestPhone(customerPhone, p.shipping_country || p.customer_country || p.country);
  const affiliate = p.aff_name?.trim() || null;
  const trafficSource = p.traffic_source?.trim() || null;
  const funnel = p.funnel_codename?.trim() || null;
  const subid = p.subid?.trim() || null;
  const paymentMethod = p.payment_method?.trim() || null;
  const saleOrigin = affiliate || trafficSource || funnel || (subid ? `subid:${subid}` : "Direct");
  const attribution = {
    customerName,
    customerPhone,
    customerPhoneE164,
    affiliate,
    trafficSource,
    funnel,
    subid,
    paymentMethod,
    saleOrigin,
  };

  // Link to an app account if one exists — by phone first (customers sign in
  // with the phone they bought with), falling back to email for legacy
  // accounts, then to another order by the same BuyGoods customer that is
  // already linked (survives a checkout email/phone typed differently).
  const user =
    (customerPhoneE164
      ? await db.query.users.findFirst({ where: eq(users.phone, customerPhoneE164), columns: { id: true } })
      : null) ??
    (email ? await db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } }) : null) ??
    (bgIdentity
      ? await db.query.orders
          .findFirst({
            where: and(
              eq(orders.buygoodsAccountId, bgIdentity.bgAccountId),
              eq(orders.buygoodsUserId, bgIdentity.bgUserId),
              isNotNull(orders.userId)
            ),
            columns: { userId: true },
          })
          .then((o) => (o?.userId ? { id: o.userId } : null))
      : null);

  if (existing) {
    await db
      .update(orders)
      .set(
        // Fields the admin panel has locked (see field-locks.ts) are dropped
        // from the patch here so a manual correction is never clobbered by
        // the webhook feed.
        stripLockedFields(
          {
            userId: existing.userId ?? user?.id ?? null,
            email: existing.email || email,
            status,
            total,
            currency,
            shippingStatus,
            shippingTrackingId: shippingTrackingId ?? existing.shippingTrackingId,
            fulfilledAt,
            refundedAt,
            chargebackAt,
            refundAmount,
            chargebackAmount,
            address: address || existing.address,
            productName: productName || existing.productName,
            productCodename: productCodename || existing.productCodename,
            upsellFlag: upsellFlag ?? existing.upsellFlag,
            buygoodsAccountId: existing.buygoodsAccountId ?? bgIdentity?.bgAccountId ?? null,
            buygoodsUserId: existing.buygoodsUserId ?? bgIdentity?.bgUserId ?? null,
            trackingSteps,
            ...attribution,
          },
          existing.lockedFields
        )
      )
      .where(eq(orders.id, existing.id));

    // Canonical customer (sticky — only when the row doesn't have one yet).
    // Identity resolution must never fail the webhook.
    if (!existing.customerId) {
      try {
        await resolveCustomerForOrder(
          existing.id,
          {
            email: email || null,
            phoneE164: customerPhoneE164,
            bgPair: bgIdentity ? { accountId: bgIdentity.bgAccountId, userId: bgIdentity.bgUserId } : null,
          },
          { name: customerName }
        );
      } catch (e) {
        console.error(`[identity] resolve failed for ${existing.id}:`, e);
      }
    }

    const ownerId = existing.userId ?? user?.id;
    if (ownerId) await hydrateUserFromOrders(ownerId);

    // notify on first transition into "shipped" (never on replays — historical)
    if (status === "shipped" && existing.status !== "shipped" && (existing.userId ?? user?.id) && !isReplay) {
      await notifyUser(existing.userId ?? user!.id, {
        title: "Your order shipped! 📦",
        body: `Order ${existing.buygoodsOrderId ?? existing.number} is on its way.${shippingStatus ? ` (${shippingStatus})` : ""}`,
        icon: "package",
        url: `/orders/${existing.id}`,
      });
    }
    invalidateCustomersCache();
    return { ok: true, status: "updated", orderId: existing.id };
  }

  const id = `bg-${bgId}`;
  await db.insert(orders).values({
    id,
    buygoodsOrderId: bgId,
    userId: user?.id ?? null,
    email,
    number: p.order_id || bgId,
    placedAt,
    status,
    total,
    currency,
    shippingStatus,
    shippingTrackingId,
    fulfilledAt,
    refundedAt,
    chargebackAt,
    refundAmount,
    chargebackAmount,
    address,
    productName,
    productCodename,
    upsellFlag,
    buygoodsAccountId: bgIdentity?.bgAccountId ?? null,
    buygoodsUserId: bgIdentity?.bgUserId ?? null,
    trackingSteps,
    ...attribution,
  });

  await db.insert(orderItems).values({
    orderId: id,
    productCodename: p.product_codename || "",
    productName: p.product_name?.trim() || p.product || "Product",
    sku: p.sku || null,
    thumbnailUrl: p.picture_thumbnail || null,
    qty: Math.max(1, parseInt(p.product_quantity || "1", 10) || 1),
    price: num(p.product_price || p.total_clean).toFixed(2),
  });

  // Canonical customer for the fresh row — never fails the webhook.
  try {
    await resolveCustomerForOrder(
      id,
      {
        email: email || null,
        phoneE164: customerPhoneE164,
        bgPair: bgIdentity ? { accountId: bgIdentity.bgAccountId, userId: bgIdentity.bgUserId } : null,
      },
      { name: customerName }
    );
  } catch (e) {
    console.error(`[identity] resolve failed for ${id}:`, e);
  }

  if (user?.id) await hydrateUserFromOrders(user.id);

  if (status === "shipped" && user?.id && !isReplay) {
    await notifyUser(user.id, {
      title: "Your order shipped! 📦",
      body: `Order ${bgId} is on its way.${shippingStatus ? ` (${shippingStatus})` : ""}`,
      icon: "package",
      url: `/orders/${id}`,
    });
  }

  invalidateCustomersCache();
  return { ok: true, status: "created", orderId: id };
}

/**
 * When a user signs up (or logs in) with an email/phone that already has
 * orders, link those orders to the account. Called from the OTP verify flow.
 * Matches on whichever identifiers are available — SMS-only accounts have no
 * email, so phone is the only key in that case.
 */
export async function linkOrdersToUser(userId: string, ids: { email?: string | null; phone?: string | null }): Promise<void> {
  const conditions = [];
  if (ids.email) conditions.push(eq(orders.email, ids.email.toLowerCase().trim()));
  if (ids.phone) conditions.push(eq(orders.customerPhoneE164, ids.phone));
  if (conditions.length === 0) return;

  await db
    .update(orders)
    .set({ userId })
    .where(conditions.length > 1 ? or(...conditions) : conditions[0]);

  // Second pass: adopt orders by the same BuyGoods customer that email/phone
  // missed (typo'd checkout email, differently formatted phone). Match on the
  // (account_id, user_id) PAIR only — user_id alone collides across accounts.
  const linked = await db
    .selectDistinct({ acct: orders.buygoodsAccountId, uid: orders.buygoodsUserId })
    .from(orders)
    .where(and(eq(orders.userId, userId), isNotNull(orders.buygoodsAccountId), isNotNull(orders.buygoodsUserId)));
  for (const pair of linked) {
    await db
      .update(orders)
      .set({ userId })
      .where(
        and(
          eq(orders.buygoodsAccountId, pair.acct!),
          eq(orders.buygoodsUserId, pair.uid!),
          isNull(orders.userId)
        )
      );
  }

  await hydrateUserFromOrders(userId);

  // Canonical customer for the account (covers SMS-only signups with no
  // orders: they become a phone-only customer). Never fails the login flow.
  try {
    const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (u) await resolveCustomerForUser(u);
  } catch (e) {
    console.error(`[identity] resolve failed for user ${userId}:`, e);
  }
  invalidateCustomersCache();
}

/**
 * BuyGoods already told us who the customer is, so onboarding never has to ask:
 * copy name/email/address off the customer's most recent linked order into any
 * field the account is still missing. Accounts created outside BuyGoods have no
 * orders to copy from — those are the ones onboarding still asks.
 */
export async function hydrateUserFromOrders(userId: string): Promise<void> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return;
  if (user.name && user.fullName && user.email && user.address) return;

  const order = await db.query.orders.findFirst({
    where: eq(orders.userId, userId),
    orderBy: [desc(orders.placedAt)],
  });
  if (!order) return;

  const fullName = order.customerName.trim();
  const email = order.email.trim().toLowerCase();

  const patch: Partial<typeof users.$inferInsert> = {};
  if (!user.fullName && fullName) patch.fullName = fullName;
  if (!user.name && fullName) patch.name = firstNameOf(fullName);
  if (!user.address && order.address) patch.address = order.address;
  if (!user.email && email) {
    // email is unique — skip if a legacy account already owns it
    const taken = await db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } });
    if (!taken) patch.email = email;
  }

  if (Object.keys(patch).length > 0) await db.update(users).set(patch).where(eq(users.id, userId));
}
