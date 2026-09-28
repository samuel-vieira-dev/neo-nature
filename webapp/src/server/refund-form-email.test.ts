import { describe, expect, it } from "vitest";
import { refundFormPath, sendRefundFormEmail } from "./refund-form-email";

describe("refund form email", () => {
  it("encodes the exact order identity without allowing additional URL parameters", () => {
    const url = new URL(refundFormPath("bg-order &other=1"), "https://example.com");
    expect(url.pathname).toBe("/refund");
    expect([...url.searchParams]).toEqual([["order_id", "bg-order &other=1"]]);
  });
  it("never simulates delivery while Mautic is pending", async () => {
    expect(await sendRefundFormEmail({ orderId: "order", orderNumber: "42", email: "test@example.com", customerName: "Test", refundPath: refundFormPath("order") })).toEqual({ status: "not_configured" });
  });
});
