import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { withAdmin, logAdminAction } from "@/server/admin";
import { refundFormPath, sendRefundFormEmail } from "@/server/refund-form-email";

export const POST = withAdmin(async (admin, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  const headers = { "Cache-Control": "no-store" };
  if (!order) return Response.json({ error: "not_found" }, { status: 404, headers });
  // Destination and link always come from the stored order, never client input.
  const email = order.email.trim();
  if (!z.email().safeParse(email).success) {
    return Response.json({ error: "invalid_email", email }, { status: 422, headers });
  }
  const requestId = crypto.randomUUID();
  const result = await sendRefundFormEmail({
    requestId,
    orderId: order.id,
    orderNumber: order.number,
    customerName: order.customerName,
    email,
    refundPath: refundFormPath(order.id),
  }).catch(() => ({ status: "failed" as const }));

  // A logging failure must not turn a confirmed send into a retryable failure.
  await logAdminAction(admin, "order.refund_form_email", { metadata: {
    orderId: order.id, email, requestId, status: result.status,
    ...(result.status === "sent" ? { messageId: result.messageId } : {}),
  } }).catch(() => console.error("[refund-form-email] Could not record delivery audit"));

  if (result.status !== "sent") {
    return Response.json({ error: result.status === "not_configured" ? "integration_not_configured" : "send_failed", email }, { status: result.status === "not_configured" ? 503 : 502, headers });
  }
  return Response.json({ ok: true, email }, { headers });
}, "orders:send-refund-form");
