import { deriveStatus, isChargebackEvent, type Params } from "@/server/buygoods";

// ---------------------------------------------------------------------------
// Fan-out of every BuyGoods IPN we receive to the client's n8n webhooks, in
// addition to our own ingest (src/server/buygoods.ts). n8n runs the client's
// own automations (e.g. their existing fulfillment relay — see
// ../../INTEGRACOES.md item 9) and wants a copy of everything we get.
//
// This module is deliberately dumb: classify() decides WHERE an event goes
// (reusing the exact same status/chargeback rules the ingest path uses, so
// the two never disagree), and forwardToN8n() just POSTs the original
// payload there. It must never throw into, or slow down, the caller — the
// route handler owes BuyGoods a fast 200 regardless of what n8n does with it.
// ---------------------------------------------------------------------------

export type N8nTarget = "orders" | "refunds" | "chargebacks";

const N8N_PATH: Record<N8nTarget, string> = {
  orders: "buygoods-orders",
  refunds: "buygoods-refunds",
  chargebacks: "buygoods-chargebacks",
};

/**
 * Which n8n webhook (if any) an IPN belongs on.
 *
 * Mapping:
 *  - no order_id_global at all → null (health check / empty ping — nothing
 *    to forward; the ingest path skips these too, see webhook-buygoods-info/route.ts).
 *  - order_id_global starting with "TSTFWD" → null. These are n8n's own
 *    workflow test pings (fake @mailinator.com customers, see
 *    scripts/replay-buygoods-logs.ts) — they don't exist in BuyGoods or the
 *    CRM, so echoing them back to n8n would just be n8n talking to itself.
 *  - a chargeback (incl. "chargeback alert" — see isChargebackEvent) → chargebacks.
 *  - any other status === "refunded" (merchant refund, not a dispute) → refunds.
 *  - everything else with a real order id — new sale, fulfillment/tracking
 *    update, shipped, cancellation — → orders. These are all lifecycle
 *    updates on an order rather than a money-movement event, so they go to
 *    the same hook a "new order" would: the client's orders workflow is the
 *    natural place to track an order end-to-end, and nothing here is a
 *    refund or chargeback. If the client wants fulfillment/cancel split out
 *    further, that's a one-line change here, not a redesign.
 */
export function classifyBuyGoodsEvent(p: Params, eventTag?: string): N8nTarget | null {
  const bgId = p.order_id_global?.trim();
  if (!bgId) return null;
  if (/^TSTFWD/i.test(bgId)) return null;

  const status = deriveStatus(p, eventTag);
  if (status !== "refunded") return "orders";
  return isChargebackEvent(p, eventTag) ? "chargebacks" : "refunds";
}

export type ForwardMeta = {
  /** ISO timestamp of when we received the IPN (not when we forward it). */
  receivedAt: string;
  /** The `event` query-string tag BuyGoods/n8n send alongside the payload. */
  eventTag?: string;
  contentType?: string | null;
  method: string;
  /** The exact bytes we received, so n8n can re-derive anything classify()/parseIpnParams() might have dropped. */
  rawBody: string;
};

function baseUrl(): string {
  return process.env.N8N_WEBHOOK_BASE_URL || "https://n8n.neonature.online/webhook";
}

/**
 * Whether forwarding should actually hit the network.
 *
 * `N8N_FORWARD_ENABLED` is an explicit override in either direction. With no
 * override: forwarding is ON in production (that's the whole point of this
 * module) and OFF everywhere else — local dev and `npm test` must never
 * fire real webhooks at the client's n8n with seeded, replayed, or
 * synthetic test data. A developer who wants to test the real integration
 * locally sets N8N_FORWARD_ENABLED=true.
 */
export function isN8nForwardEnabled(): boolean {
  const flag = process.env.N8N_FORWARD_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return process.env.NODE_ENV === "production";
}

/**
 * POSTs the original IPN (parsed params + metadata) to the n8n webhook for
 * `target`. Fire-and-forget: never throws, never rejects — every failure
 * mode (disabled, network error, non-2xx) is caught and logged so the
 * outcome is auditable in the app logs without needing a DB table for it.
 * Bounded by an 8s timeout so a slow/dead n8n can never hang the caller.
 */
export async function forwardToN8n(target: N8nTarget, params: Params, meta: ForwardMeta): Promise<void> {
  const orderId = params.order_id_global || "?";

  if (!isN8nForwardEnabled()) {
    console.log(`[n8n-forward] disabled — skipped ${target} for order ${orderId}`);
    return;
  }

  const url = `${baseUrl()}/${N8N_PATH[target]}`;
  const body = JSON.stringify({
    params,
    received_at: meta.receivedAt,
    event: meta.eventTag ?? null,
    content_type: meta.contentType ?? null,
    method: meta.method,
    raw_body: meta.rawBody,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[n8n-forward] ${target} failed for order ${orderId}: ${res.status} ${detail.slice(0, 200)}`);
      return;
    }
    console.log(`[n8n-forward] ${target} ok for order ${orderId} (${res.status})`);
  } catch (e) {
    console.error(`[n8n-forward] ${target} threw for order ${orderId}:`, e instanceof Error ? e.message : e);
  }
}
