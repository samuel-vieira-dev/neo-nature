import { RefundError, cents, decimal } from "./order-refund-policy";

export type RefundProviderResult = { status: "succeeded" | "failed" | "unknown"; reference: string; message: string };
export type UpstreamOrder = { orderId: string; currency: string; remaining: number; total: number; status: string; reviewStatus: string };
export interface RefundProvider {
  mode: "mock" | "live";
  queryOrder?(orderId: string): Promise<UpstreamOrder>;
  refund(input: { requestId: string; orderId: string; kind: "full" | "partial"; amount: string; currency: string; reason: string }): Promise<RefundProviderResult>;
}
export function refundMode(): "mock" | "live" | "disabled" {
  const mode = process.env.KONNEKTIVE_REFUND_MODE;
  return mode === "mock" || mode === "live" ? mode : "disabled";
}

function credentials() {
  const loginId = process.env.KONNEKTIVE_API_LOGIN_ID;
  const password = process.env.KONNEKTIVE_API_PASSWORD;
  if (!loginId || !password) throw new RefundError("konnektive_credentials_missing", 503);
  return { loginId, password };
}

async function call(endpoint: "order/query/" | "order/refund/", fields: Record<string, string>) {
  const response = await fetch(`https://api.konnektive.com/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...credentials(), ...fields }),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`Konnektive HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("result" in body)) throw new Error("Invalid Konnektive response");
  return body as { result: string; message?: unknown };
}

export async function queryKonnektiveOrder(orderId: string): Promise<UpstreamOrder> {
  const body = await call("order/query/", { orderId, exTestCards: "0" });
  if (body.result !== "SUCCESS") throw new RefundError("upstream_order_unavailable", 409);
  const data = body.message && typeof body.message === "object" && "data" in body.message ? body.message.data : null;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== "object" || row.clientOrderId !== orderId) throw new RefundError("upstream_order_mismatch", 409);
  const currency = row.currencyCode;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) throw new RefundError("upstream_currency_unknown", 409);
  const remaining = cents(String(row.refundRemaining));
  const total = cents(String(row.totalAmount));
  if (remaining > total) throw new RefundError("upstream_balance_invalid", 409);
  return { orderId, currency, remaining, total, status: String(row.orderStatus ?? ""), reviewStatus: String(row.reviewStatus ?? "") };
}

export function refundProvider(): RefundProvider {
  const mode = refundMode();
  if (mode === "disabled") throw new RefundError("refund_processing_disabled", 503);
  if (mode === "mock") return {
    mode,
    async refund({ requestId }) {
      const scenario = process.env.KONNEKTIVE_REFUND_MOCK_RESULT ?? "success";
      if (!["success", "decline", "timeout"].includes(scenario)) throw new RefundError("invalid_mock_configuration", 503);
      return {
        status: scenario === "success" ? "succeeded" : scenario === "decline" ? "failed" : "unknown",
        reference: `mock-${requestId}`,
        message: scenario === "success" ? "Simulated refund. No money moved." : scenario === "decline" ? "Simulated decline. No money moved." : "Simulated timeout. Reconciliation required before another attempt.",
      };
    },
  };
  credentials();
  return {
    mode,
    queryOrder: queryKonnektiveOrder,
    async refund({ orderId, kind, amount, reason }) {
      const body = await call("order/refund/", { orderId, ...(kind === "full" ? { fullRefund: "true" } : { refundAmount: amount }), refundReason: reason });
      const message = typeof body.message === "string" ? body.message.slice(0, 500) : "Konnektive returned an unexpected response";
      return { status: body.result === "SUCCESS" ? "succeeded" : body.result === "ERROR" ? "failed" : "unknown", reference: orderId, message };
    },
  };
}

export function upstreamBalance(order: UpstreamOrder) { return decimal(order.remaining); }
