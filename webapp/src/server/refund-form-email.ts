/** Provider boundary. Only return sent after Mautic confirms acceptance.
 * Pending the client's API/auth/template details; never simulate a delivery.
 * refundPath must be resolved against the configured public Webapp origin
 * by the future adapter (not request.url, which can be internal on Railway).
 */
export type RefundFormEmail = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  email: string;
  refundPath: string;
};
export type RefundFormEmailResult =
  | { status: "sent"; messageId: string }
  | { status: "not_configured" | "failed" };

export function refundFormPath(orderId: string): string {
  return `/refund?${new URLSearchParams({ order_id: orderId })}`;
}

export async function sendRefundFormEmail(input: RefundFormEmail): Promise<RefundFormEmailResult> {
  void input;
  return { status: "not_configured" };
}
