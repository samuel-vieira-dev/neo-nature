import { describe, it, expect, afterEach, vi } from "vitest";
import { availableCents, cents, decimal, refundInput, validateRefundAmount, type RefundOrder } from "./order-refund-policy";
import { refundProvider, refundMode } from "./konnektive-refund-provider";
const order: RefundOrder = { source: "konnektive", konnektiveOrderId: "ABC123", total: "100.00", currency: "USD", status: "confirmed", refundedAt: null, refundAmount: null, chargebackAt: null, chargebackAmount: null };
const input = { requestId: "181772ca-1911-46f6-88ba-45e5fc737898", kind: "partial" as const, amount: "20.00", reason: "Customer request" };
afterEach(() => vi.unstubAllEnvs());
describe("refund safeguards", () => {
  it("calculates successive partials and full remainder in cents", () => {
    expect(cents("0.29")).toBe(29);
    const available = availableCents({ ...order, refundAmount: "10.10" }, cents("20.20"));
    expect(decimal(available)).toBe("69.70");
    expect(validateRefundAmount({ ...input, kind: "full", amount: "69.70" }, available)).toBe(6970);
  });
  it.each(["buygoods", "", "Konnektive", "other"])("blocks source %s", source => {
    expect(() => availableCents({ ...order, source }, 0)).toThrow("konnektive_orders_only");
  });
  it("blocks missing identifiers, disputes and ambiguous existing refunds", () => {
    expect(() => availableCents({ ...order, konnektiveOrderId: null }, 0)).toThrow("missing_konnektive_order_id");
    expect(() => availableCents({ ...order, chargebackAmount: "1" }, 0)).toThrow("chargeback_order");
    expect(() => availableCents({ ...order, chargebackAt: new Date() }, 0)).toThrow("chargeback_order");
    expect(() => availableCents({ ...order, status: "refunded" }, 0)).toThrow("refund_balance_unknown");
    expect(() => availableCents({ ...order, refundedAt: new Date() }, 0)).toThrow("refund_balance_unknown");
    expect(() => availableCents({ ...order, status: "canceled" }, 0)).toThrow("canceled_order");
  });
  it("allows a known partial despite upstream refunded status", () => {
    expect(availableCents({ ...order, status: "refunded", refundAmount: "30.00" }, 0)).toBe(7000);
  });
  it("rejects zero, over-refunds and stale full-refund previews", () => {
    for (const amount of ["0", "100.01"]) expect(() => validateRefundAmount({ ...input, amount }, 10000)).toThrow("invalid_refund_amount");
    expect(() => validateRefundAmount({ ...input, kind: "full", amount: "100" }, 8000)).toThrow("invalid_refund_amount");
    expect(() => validateRefundAmount({ ...input, kind: "full", amount: "50" }, 8000)).toThrow("balance_changed");
    expect(() => validateRefundAmount({ ...input, amount: "100" }, 10000)).toThrow("partial_must_be_less_than_balance");
    expect(() => availableCents(order, 10000)).toThrow("no_refundable_balance");
  });
  it.each(["-1", "1e2", "0.001", "Infinity", "NaN", "1,50", "100000000"])("rejects malformed money %s", amount => {
    expect(refundInput.safeParse({ ...input, amount }).success).toBe(false);
  });
  it("does not accept client-supplied origin, currency or mode", () => {
    expect(refundInput.safeParse({ ...input, source: "konnektive", mode: "live" }).success).toBe(false);
  });
});
describe("mock provider boundary", () => {
  it("defaults to disabled and requires credentials for live refunds", () => {
    vi.stubEnv("KONNEKTIVE_REFUND_MODE", "");
    expect(refundMode()).toBe("disabled");
    vi.stubEnv("KONNEKTIVE_REFUND_MODE", "live");
    expect(() => refundProvider()).toThrow("konnektive_credentials_missing");
  });
  it.each([["success", "succeeded"], ["decline", "failed"], ["timeout", "unknown"]])("simulates %s without a network request", async (scenario, status) => {
    vi.stubEnv("KONNEKTIVE_REFUND_MODE", "mock");
    vi.stubEnv("KONNEKTIVE_REFUND_MOCK_RESULT", scenario);
    const network = vi.spyOn(globalThis, "fetch");
    const result = await refundProvider().refund({ ...input, orderId: "ABC123", currency: "USD" });
    expect(result.status).toBe(status);
    expect(result.reference).toBe(`mock-${input.requestId}`);
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
  });
});
