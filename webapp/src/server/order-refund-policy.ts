import { z } from "zod";

export const refundInput = z.object({
  requestId: z.uuid(),
  kind: z.enum(["full", "partial"]),
  amount: z.string().regex(/^\d{1,8}(\.\d{1,2})?$/),
  reason: z.string().trim().min(3).max(500),
}).strict();
export type RefundInput = z.infer<typeof refundInput>;
export class RefundError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
// Money stays in integer minor units throughout validation and accumulation.
export function cents(value: string): number {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value)) throw new RefundError("invalid_amount", 400);
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function decimal(value: number) { return (value / 100).toFixed(2); }
export type RefundOrder = {
  source: string; konnektiveOrderId: string | null; total: string; currency: string;
  status: string; refundedAt: Date | null; refundAmount: string | null;
  chargebackAt: Date | null; chargebackAmount: string | null;
};
export function assertRefundOrigin(order: RefundOrder) {
  if (order.source !== "konnektive") throw new RefundError("konnektive_orders_only");
  if (!order.konnektiveOrderId) throw new RefundError("missing_konnektive_order_id");
}
export function availableCents(order: RefundOrder, simulatedCents: number) {
  assertRefundOrigin(order);
  if (order.chargebackAt || (order.chargebackAmount && cents(order.chargebackAmount) > 0)) throw new RefundError("chargeback_order");
  if (order.status === "canceled") throw new RefundError("canceled_order");
  if (!/^[A-Z]{3}$/.test(order.currency)) throw new RefundError("invalid_currency");
  if ((order.refundedAt || order.status === "refunded") && order.refundAmount === null) throw new RefundError("refund_balance_unknown");
  const available = cents(order.total) - cents(order.refundAmount ?? "0") - simulatedCents;
  if (available <= 0) throw new RefundError("no_refundable_balance");
  return available;
}
export function validateRefundAmount(input: RefundInput, available: number) {
  const amount = cents(input.amount);
  if (amount <= 0 || amount > available) throw new RefundError("invalid_refund_amount", 400);
  if (input.kind === "full" && amount !== available) throw new RefundError("balance_changed");
  if (input.kind === "partial" && amount >= available) throw new RefundError("partial_must_be_less_than_balance", 400);
  return amount;
}
