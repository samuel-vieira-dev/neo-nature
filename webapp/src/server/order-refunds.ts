import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderRefunds, adminActionLogs } from "@/db/schema";
import type { AdminContext } from "./admin";
import { assertRefundOrigin, availableCents, cents, decimal, RefundError, type RefundInput, validateRefundAmount } from "./order-refund-policy";
import { refundMode, refundProvider, upstreamBalance } from "./konnektive-refund-provider";

function assertUpstreamRefundable(status: string, reviewStatus: string) {
  if (status === "PENDING" || reviewStatus === "PENDING") throw new RefundError("upstream_order_pending");
  if (!["COMPLETE", "SALE", "REFUNDED", "PARTIAL_REFUNDED"].includes(status)) throw new RefundError("upstream_order_not_refundable");
}

export async function refundSummary(orderId: string) {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) throw new RefundError("not_found", 404);
  assertRefundOrigin(order);
  const mode = refundMode();
  const history = await db.select().from(orderRefunds).where(and(eq(orderRefunds.orderId, orderId), eq(orderRefunds.mode, mode))).orderBy(desc(orderRefunds.createdAt));
  const simulated = history.filter(r => r.status === "succeeded").reduce((sum, r) => sum + cents(r.amount), 0);
  let blockedReason: string | null = null;
  let available = 0;
  let currency = order.currency;
  try {
    if (mode === "live") {
      if (order.chargebackAt || order.chargebackAmount) throw new RefundError("chargeback_order");
      if (order.status === "canceled") throw new RefundError("canceled_order");
      const provider = refundProvider();
      const upstream = await provider.queryOrder!(order.konnektiveOrderId!);
      if (upstream.currency !== order.currency) throw new RefundError("currency_mismatch");
      currency = upstream.currency;
      available = upstream.remaining;
      if (available <= 0) throw new RefundError("no_refundable_balance");
      assertUpstreamRefundable(upstream.status, upstream.reviewStatus);
    } else {
      available = availableCents(order, simulated);
    }
  } catch (e) {
    if (e instanceof RefundError) blockedReason = e.message;
    else blockedReason = "upstream_query_failed";
  }
  if (history.some(r => r.status === "unknown" || r.status === "processing")) blockedReason = "reconciliation_required";
  if (mode === "disabled") blockedReason = "refund_processing_disabled";
  return { mode, currency, available: decimal(available), simulatedTotal: decimal(simulated), blockedReason, history };
}

export async function processOrderRefund(orderId: string, input: RefundInput, admin: AdminContext) {
  const provider = refundProvider();
  if (provider.mode === "live") return processLiveRefund(orderId, input, admin, provider);
  // The mock provider performs no network I/O; ledger and audit commit together.
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new RefundError("not_found", 404);
    assertRefundOrigin(order);
    const [previous] = await tx.select().from(orderRefunds).where(eq(orderRefunds.id, input.requestId));
    if (previous) {
      assertSameRequest(previous, orderId, input, provider.mode);
      return previous;
    }
    const history = await tx.select().from(orderRefunds).where(and(eq(orderRefunds.orderId, orderId), eq(orderRefunds.mode, provider.mode)));
    if (history.some(r => r.status === "processing" || r.status === "unknown")) throw new RefundError("reconciliation_required");
    const simulated = history.filter(r => r.status === "succeeded").reduce((sum, r) => sum + cents(r.amount), 0);
    const amount = decimal(validateRefundAmount(input, availableCents(order, simulated)));
    const result = await provider.refund({ requestId: input.requestId, orderId: order.konnektiveOrderId!, kind: input.kind, amount, currency: order.currency, reason: input.reason });
    const [record] = await tx.insert(orderRefunds).values({ id: input.requestId, orderId, mode: provider.mode, kind: input.kind, amount, currency: order.currency, reason: input.reason, adminUserId: admin.id, status: result.status, providerReference: result.reference, message: result.message }).returning();
    await tx.insert(adminActionLogs).values({ adminUserId: admin.id, action: "order.refund.mock", targetUserId: order.userId, metadata: { orderId, requestId: input.requestId, amount, currency: order.currency, status: result.status, mode: provider.mode } });
    return record;
  });
}

type RecordRow = typeof orderRefunds.$inferSelect;
function assertSameRequest(previous: RecordRow, orderId: string, input: RefundInput, mode: string) {
  if (previous.orderId !== orderId || previous.kind !== input.kind || cents(previous.amount) !== cents(input.amount) || previous.reason !== input.reason || previous.mode !== mode) throw new RefundError("idempotency_conflict");
}

async function processLiveRefund(orderId: string, input: RefundInput, admin: AdminContext, provider: ReturnType<typeof refundProvider>) {
  const reserved = await db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new RefundError("not_found", 404);
    assertRefundOrigin(order);
    if (order.chargebackAt || order.chargebackAmount) throw new RefundError("chargeback_order");
    if (order.status === "canceled") throw new RefundError("canceled_order");
    const [previous] = await tx.select().from(orderRefunds).where(eq(orderRefunds.id, input.requestId));
    if (previous) {
      assertSameRequest(previous, orderId, input, "live");
      return { previous };
    }
    const history = await tx.select().from(orderRefunds).where(and(eq(orderRefunds.orderId, orderId), eq(orderRefunds.mode, "live")));
    if (history.some(r => r.status === "processing" || r.status === "unknown")) throw new RefundError("reconciliation_required");
    const [record] = await tx.insert(orderRefunds).values({ id: input.requestId, orderId, mode: "live", kind: input.kind, amount: decimal(cents(input.amount)), currency: order.currency, reason: input.reason, adminUserId: admin.id, status: "processing", message: "Checking Konnektive balance" }).returning();
    await tx.insert(adminActionLogs).values({ adminUserId: admin.id, action: "order.refund.started", targetUserId: order.userId, metadata: { orderId, requestId: input.requestId, amount: record.amount, currency: order.currency } });
    return { record, upstreamId: order.konnektiveOrderId!, currency: order.currency, userId: order.userId };
  });
  if (reserved.previous) return reserved.previous;
  const { upstreamId, currency, userId } = reserved;
  const finish = async (status: "succeeded" | "failed" | "unknown", message: string) => {
    return db.transaction(async tx => {
      const [record] = await tx.update(orderRefunds).set({ status, message, providerReference: upstreamId }).where(eq(orderRefunds.id, input.requestId)).returning();
      await tx.insert(adminActionLogs).values({ adminUserId: admin.id, action: "order.refund.live", targetUserId: userId, metadata: { orderId, requestId: input.requestId, amount: record.amount, currency, status, message } });
      return record;
    });
  };
  let before;
  try {
    before = await provider.queryOrder!(upstreamId);
    if (before.currency !== currency) throw new RefundError("currency_mismatch");
    assertUpstreamRefundable(before.status, before.reviewStatus);
    validateRefundAmount(input, before.remaining);
  } catch (e) {
    return finish("failed", e instanceof RefundError ? e.message : "Could not verify the Konnektive balance");
  }
  let result;
  try {
    result = await provider.refund({ requestId: input.requestId, orderId: upstreamId, kind: input.kind, amount: input.amount, currency, reason: input.reason });
  } catch {
    return finish("unknown", "Konnektive response uncertain. Verify this request in Konnektive before any other refund.");
  }
  if (result.status !== "succeeded") return finish(result.status, result.message);
  try {
    const after = await provider.queryOrder!(upstreamId);
    if (after.currency !== currency || after.remaining > before.remaining - cents(input.amount)) return finish("unknown", "Refund accepted but balance is not yet confirmed. Verify in Konnektive.");
    return finish("succeeded", `Refund confirmed. Remaining balance: ${after.currency} ${upstreamBalance(after)}. Verify in Konnektive.`);
  } catch {
    return finish("unknown", "Refund accepted but balance could not be rechecked. Verify in Konnektive.");
  }
}
