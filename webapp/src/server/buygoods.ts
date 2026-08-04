import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, users } from "@/db/schema";
import { notifyUser } from "@/server/push";
import { normalizeIngestPhone } from "@/lib/phone-format";

// ---------------------------------------------------------------------------
// BuyGoods IPN ingestion. BuyGoods POSTs form-urlencoded order events to
// /webhook-buygoods-info (and duplicates the same fields on the query string).
// We upsert an order keyed by order_id_global, matched to an app user by email.
//
// BuyGoods does NOT send a carrier tracking number — only a shipping STATUS
// text ("Shipped on 27 Feb, 2023") + fulfillment date. So the app tracks order
// STATUS, not a carrier parcel. A real tracking link needs a 3PL (see
// INTEGRACOES.md item 9).
// ---------------------------------------------------------------------------

type Params = Record<string, string>;

/** Merge query + body form params; body is canonical, query fills gaps. */
export function parseIpnParams(query: Params, body: string): Params {
  const merged: Params = { ...query };
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

type OrderStatus = "confirmed" | "shipped" | "canceled" | "refunded";

function deriveStatus(p: Params, eventTag: string | undefined): OrderStatus {
  const action = (p.action_type || p.type || eventTag || "").toLowerCase();
  if (p.was_canceled === "1" || action.includes("cancel")) return "canceled";
  if (action.includes("refund")) return "refunded";
  const shipped = Number(p.was_fulfilled || 0) >= 1 || /^shipped/i.test(p.shipping_status || "");
  return shipped ? "shipped" : "confirmed";
}

function buildTrackingSteps(status: OrderStatus, placed: Date, fulfilledAt: Date | null, shippingStatus: string | undefined) {
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
      { label: "Refunded", detail: "Your refund has been processed.", date: "", done: true, current: true },
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
export async function ingestBuyGoodsEvent(p: Params, eventTag?: string): Promise<IngestResult> {
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
  const address = [p.shipping_address, p.shipping_city, p.shipping_state, p.shipping_zip, p.shipping_country]
    .filter(Boolean)
    .join(", ");
  const trackingSteps = buildTrackingSteps(status, placedAt, fulfilledAt, shippingStatus);

  // customer + attribution (for the admin CRM)
  const customerName =
    p.customer_name?.trim() ||
    [p.customer_firstname, p.customer_lastname].filter(Boolean).join(" ").trim() ||
    "";
  const customerPhone = p.customer_phone?.trim() || null;
  const customerPhoneE164 = normalizeIngestPhone(customerPhone);
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
  // with the phone they bought with), falling back to email for legacy accounts.
  const user =
    (customerPhoneE164
      ? await db.query.users.findFirst({ where: eq(users.phone, customerPhoneE164), columns: { id: true } })
      : null) ??
    (email ? await db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } }) : null);

  const existing = await db.query.orders.findFirst({ where: eq(orders.buygoodsOrderId, bgId) });

  if (existing) {
    await db
      .update(orders)
      .set({
        userId: existing.userId ?? user?.id ?? null,
        email: existing.email || email,
        status,
        total,
        currency,
        shippingStatus,
        fulfilledAt,
        address: address || existing.address,
        trackingSteps,
        ...attribution,
      })
      .where(eq(orders.id, existing.id));

    // notify on first transition into "shipped"
    if (status === "shipped" && existing.status !== "shipped" && (existing.userId ?? user?.id)) {
      await notifyUser(existing.userId ?? user!.id, {
        title: "Your order shipped! 📦",
        body: `Order ${existing.number} is on its way.${shippingStatus ? ` (${shippingStatus})` : ""}`,
        icon: "package",
        url: `/orders/${existing.id}`,
      });
    }
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
    fulfilledAt,
    address,
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

  if (status === "shipped" && user?.id) {
    await notifyUser(user.id, {
      title: "Your order shipped! 📦",
      body: `Order ${p.order_id || bgId} is on its way.${shippingStatus ? ` (${shippingStatus})` : ""}`,
      icon: "package",
      url: `/orders/${id}`,
    });
  }

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
}
