/** Sends the complete English email through the client's n8n → Gmail workflow.
 * The webhook only delivers; the subject and both body formats live here.
 * Report success solely when n8n confirms Gmail acceptance with a message ID.
 */
export type RefundFormEmail = {
  requestId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  email: string;
  refundPath: string;
};
export type RefundFormEmailResult =
  | { status: "sent"; messageId: string }
  | { status: "not_configured" | "failed" };

const WEBHOOK_URL = "https://n8n.neonature.online/webhook/enviar-form-cliente";
const PUBLIC_APP_URL = "https://app.beneonature.com";

export function refundFormPath(orderId: string): string {
  return `/refund?${new URLSearchParams({ order_id: orderId })}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

export function refundFormEmailPayload(input: RefundFormEmail) {
  const refundUrl = new URL(input.refundPath, PUBLIC_APP_URL).toString();
  const greetingName = input.customerName.trim().split(/\s+/)[0] || "there";
  const name = escapeHtml(greetingName);
  const orderNumber = escapeHtml(input.orderNumber);
  const safeUrl = escapeHtml(refundUrl);
  return {
    requestId: input.requestId,
    to: input.email,
    subject: "Complete your Neo Nature refund request",
    html: `<p>Hi ${name},</p><p>As discussed with our support team, please complete the refund request form for order #${orderNumber}.</p><p><a href="${safeUrl}">Complete refund form</a></p><p>We may need to confirm whether a package must be returned before processing your request.</p><p>If you did not request this, you can ignore this email.</p><p>Neo Nature</p>`,
    text: `Hi ${greetingName},\n\nAs discussed with our support team, please complete the refund request form for order #${input.orderNumber}.\n\nComplete refund form: ${refundUrl}\n\nWe may need to confirm whether a package must be returned before processing your request.\n\nIf you did not request this, you can ignore this email.\n\nNeo Nature`,
  };
}

export async function sendRefundFormEmail(input: RefundFormEmail): Promise<RefundFormEmailResult> {
  const apiKey = process.env.REFUND_EMAIL_WEBHOOK_API_KEY?.trim();
  if (!apiKey) return { status: "not_configured" };
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify(refundFormEmailPayload(input)),
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error(`[refund-form-email] n8n rejected request ${input.requestId}: HTTP ${response.status}`);
      return { status: "failed" };
    }
    const body = await response.json().catch(() => null);
    if (body?.requestId !== input.requestId || body?.success !== true || typeof body?.messageId !== "string" || !body.messageId.trim()) {
      console.error(`[refund-form-email] n8n response did not confirm send for ${input.requestId}`);
      return { status: "failed" };
    }
    return { status: "sent", messageId: body.messageId };
  } catch (error) {
    console.error(`[refund-form-email] n8n request ${input.requestId} failed:`, error instanceof Error ? error.message : "unknown error");
    return { status: "failed" };
  }
}
