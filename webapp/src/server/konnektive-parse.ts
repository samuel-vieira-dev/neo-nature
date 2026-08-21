// Relative import (not "@/lib/…") so vitest can load this module without the
// Next.js path aliases — same reason domain.ts imports "./time".
import { normalizeIngestPhone } from "../lib/phone-format";

// ---------------------------------------------------------------------------
// Konnektive payload parsing — the pure half of the integration, kept free of
// DB imports so it can be tested against real captures without a database.
// The upsert lives in konnektive.ts.
//
// Konnektive is a SECOND, independent order feed — it sells different orders
// than BuyGoods, so nothing here dedupes against BuyGoods rows; the two never
// describe the same purchase.
//
// Two senders POST to /webhook-konnektive with DIFFERENT payload shapes:
//
//   "proxy"  — the client's own relay (user-agent kn-backfill/1.0). Nested
//              items[] + fulfillments[], plus flattened snake_case aliases,
//              plus proxy* metadata and an idempotency-key header.
//   "direct" — Konnektive's native webhook. Flat camelCase, no items[] and no
//              fulfillments[]; it reports lifecycle events (UPSELL, FULFILLMENT)
//              on an order the proxy feed describes in full.
//
// Both describe the same orders, so both must land on the same row. The only
// field that means the same thing in both is `clientOrderId` (the hash) —
// `orderId` is that hash on the proxy feed but the numeric id on the direct
// feed. normalize() flattens both into one shape keyed on clientOrderId.
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";

function num(v: unknown): number {
  const n = parseFloat(str(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

/** Konnektive dates: "YYYY-MM-DD HH:MM:SS", read as UTC (same as the BuyGoods ingest). */
function parseDate(v: unknown): Date | null {
  const s = str(v);
  if (!s || s.startsWith("0000-00-00")) return null;
  const iso = /^\d{4}-\d{2}-\d{2} /.test(s) ? s.replace(" ", "T") + "Z" : s;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Raw[]) : []);

export type OrderStatus = "confirmed" | "shipped" | "canceled" | "refunded";

export type KonnektiveItem = {
  productId: string;
  name: string;
  sku: string | null;
  qty: number;
  price: string;
};

export type NormalizedOrder = {
  clientOrderId: string;
  number: string;
  placedAt: Date;
  status: OrderStatus;
  total: string;
  currency: string;
  email: string;
  customerName: string;
  customerPhone: string | null;
  customerPhoneE164: string | null;
  address: string;
  items: KonnektiveItem[];
  shippingStatus: string | undefined;
  shippingTrackingId: string | undefined;
  fulfilledAt: Date | null;
  campaignId: string;
  affiliate: string | null;
  trafficSource: string | null;
  funnel: string | null;
  subid: string | null;
  paymentMethod: string | null;
  saleOrigin: string;
  /** Bank-initiated dispute rather than a merchant refund — status is still "refunded". */
  isChargeback: boolean;
  /** Amount actually refunded/charged back, when the feed reports one — may be less than `total`. */
  refundAmount: string | null;
  /** Backfill/replay rather than a live event — ingest it, but stay silent. */
  isReplay: boolean;
};

export type NormalizeResult =
  | { ok: true; order: NormalizedOrder }
  | { ok: false; reason: string };

/**
 * A checkout that never became a purchase. Konnektive emits these for abandoned
 * carts — orderStatus PARTIAL, totalPrice 0.00, declineReason set — as lead
 * capture for its own remarketing. They are NOT orders: ingesting them would
 * show a customer a $0 "order" they never placed.
 */
function isPartial(p: Raw): boolean {
  return str(p.orderStatus).toUpperCase() === "PARTIAL" || str(p.customerType).toUpperCase() === "PARTIAL";
}

/**
 * Campaign allowlist. Konnektive carries several brands on one account, so a
 * campaign that isn't ours must not turn into an order in this app. Set
 * KONNEKTIVE_CAMPAIGN_IDS to a comma-separated list of campaignId values to
 * restrict it; unset means "accept everything", which is the current behaviour.
 */
function campaignAllowed(campaignId: string): boolean {
  const allow = (process.env.KONNEKTIVE_CAMPAIGN_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.length === 0 || allow.includes(campaignId);
}

/** Fulfillment state, from whichever feed shape carries it. */
function readFulfillment(p: Raw): { status: string; tracking: string; shippedAt: Date | null } {
  const fulfillments = arr(p.fulfillments);
  const f = fulfillments[0] ?? {};
  return {
    status: (str(p.fulfillmentStatus) || str(p.fulfillment_status) || str(f.status)).toUpperCase(),
    tracking: str(p.trackingNumber) || str(p.tracking_number) || str(f.trackingNumber),
    shippedAt: parseDate(p.dateShipped ?? p.date_shipped ?? f.dateShipped),
  };
}

/** Bank-initiated dispute, distinct from a merchant-issued refund but tracked under the same "refunded" status. */
function isChargeback(p: Raw): boolean {
  const orderStatus = str(p.orderStatus).toUpperCase();
  return orderStatus.includes("CHARGEBACK") || orderStatus.includes("DISPUTE");
}

function deriveStatus(p: Raw): OrderStatus {
  const orderStatus = str(p.orderStatus).toUpperCase();
  if (orderStatus.includes("REFUND") || isChargeback(p)) return "refunded";
  if (orderStatus.includes("CANCEL") || orderStatus.includes("VOID")) return "canceled";

  const { status, tracking } = readFulfillment(p);
  // HOLD and PENDING mean the fulfillment house has it but nothing has moved.
  if (status === "SHIPPED" || status === "DELIVERED" || tracking) return "shipped";
  return "confirmed";
}


function readItems(p: Raw): KonnektiveItem[] {
  const items = arr(p.items);
  if (items.length > 0) {
    return items.map((it) => ({
      productId: str(it.productId),
      name: str(it.name) || "Product",
      sku: str(it.productSku) || null,
      qty: Math.max(1, Math.trunc(num(it.qty)) || 1),
      price: num(it.price).toFixed(2),
    }));
  }
  // The direct feed sends no items[]. The flattened proxy aliases are the only
  // other source; when neither exists we return nothing rather than inventing a
  // line, and the ingest leaves whatever the order already had untouched.
  const name = str(p.product_name) || str(p.products_text);
  if (!name) return [];
  return [
    {
      productId: str(p.product_id),
      name,
      sku: null,
      qty: Math.max(1, Math.trunc(num(p.product_qty)) || 1),
      price: num(p.product_price).toFixed(2),
    },
  ];
}

/**
 * Order total. The proxy feed sends `totalAmount`; the direct feed sends
 * `totalPrice` and `orderTotal`, which DIVERGE on upsell events — orderTotal
 * stays at the original sale while totalPrice carries the running total
 * including the upsell (e.g. 294.00 vs 587.99). We take the running total,
 * since the customer-facing figure should be everything they were charged.
 */
function readTotal(p: Raw): string {
  const candidates = [num(p.totalAmount), num(p.totalPrice), num(p.orderTotal)].filter((n) => n > 0);
  return (candidates.length > 0 ? Math.max(...candidates) : 0).toFixed(2);
}

/**
 * Refund/chargeback amount, when the feed reports one. Refunds are frequently
 * partial (customer keeps part of the order), so this must NOT default to the
 * full order total when absent — null means "amount unknown", not "full refund".
 * Field names are best-effort (no confirmed real capture with a refund amount
 * yet — check webhook_logs for the actual payload and adjust if these miss).
 */
function readRefundAmount(p: Raw): string | null {
  const candidates = [num(p.refundAmount), num(p.refund_amount), num(p.totalRefunded), num(p.amountRefunded)].filter(
    (n) => n > 0
  );
  return candidates.length > 0 ? Math.max(...candidates).toFixed(2) : null;
}

/** Flattens either feed shape into one order, or explains why it was skipped. */
export function normalize(payload: unknown, opts: { replayHeader?: boolean } = {}): NormalizeResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "payload is not an object" };
  }
  const p = payload as Raw;

  const clientOrderId = str(p.clientOrderId) || str(p.canonical_order_id);
  if (!clientOrderId) return { ok: false, reason: "missing clientOrderId" };

  if (isPartial(p)) return { ok: false, reason: `partial checkout (${clientOrderId}) — not a purchase` };

  const campaignId = str(p.campaignId) || str(p.campaign_id);
  if (!campaignAllowed(campaignId)) {
    return { ok: false, reason: `campaign ${campaignId} not in KONNEKTIVE_CAMPAIGN_IDS` };
  }

  const status = deriveStatus(p);
  const { status: fulfillmentStatus, tracking, shippedAt } = readFulfillment(p);
  const placedAt = parseDate(p.dateCreated) ?? parseDate(p.acquisitionDate) ?? parseDate(p.proxyReceivedAt) ?? new Date();

  const email = (str(p.emailAddress) || str(p.email)).toLowerCase();
  const customerName =
    str(p.fullName) ||
    str(p.name) ||
    [str(p.firstName) || str(p.first_name), str(p.lastName) || str(p.last_name)].filter(Boolean).join(" ");
  const customerPhone = str(p.phoneNumber) || str(p.phone) || null;

  const address = [
    str(p.shipAddress1) || str(p.ship_address1),
    str(p.shipAddress2) || str(p.ship_address2),
    str(p.shipCity) || str(p.ship_city),
    str(p.shipState) || str(p.ship_state),
    str(p.shipPostalCode) || str(p.ship_postal_code),
    str(p.shipCountry) || str(p.ship_country),
  ]
    .filter(Boolean)
    .join(", ");

  const affiliate = str(p.affId) || null;
  const trafficSource = str(p.UTMSource) || str(p.sourceTitle) || null;
  const funnel = str(p.campaignName) || null;
  const subid = str(p.subAffId) || str(p.sourceValue2) || null;
  const paymentMethod = str(p.paySource) || str(p.cardType) || null;

  return {
    ok: true,
    order: {
      clientOrderId,
      // Human-facing order number: the numeric id, which each feed names
      // differently (actualOrderId on proxy, orderId on direct).
      number: str(p.actualOrderId) || str(p.order_id) || str(p.orderId) || clientOrderId,
      placedAt,
      status,
      total: readTotal(p),
      currency: str(p.currencyCode) || "USD",
      email,
      customerName,
      customerPhone,
      customerPhoneE164: normalizeIngestPhone(customerPhone, str(p.shipCountry) || str(p.ship_country) || str(p.country) || null),
      address,
      items: readItems(p),
      shippingStatus: fulfillmentStatus || undefined,
      shippingTrackingId: tracking || undefined,
      fulfilledAt: shippedAt,
      campaignId,
      affiliate,
      trafficSource,
      funnel,
      subid,
      paymentMethod,
      saleOrigin: affiliate || trafficSource || funnel || (subid ? `subid:${subid}` : "Direct"),
      isChargeback: isChargeback(p),
      refundAmount: readRefundAmount(p),
      isReplay: p.proxyReplay === true || opts.replayHeader === true,
    },
  };
}
