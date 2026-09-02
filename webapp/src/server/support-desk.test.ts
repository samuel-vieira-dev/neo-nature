import { describe, it, expect } from "vitest";
import {
  buildCustomerIndexes,
  isAwaitingShipment,
  matchCustomerForRequester,
  projectSupportCustomer,
} from "./support-desk";
import type { CustomerOrder, CustomerRow } from "./crm";

function makeOrder(overrides: Partial<CustomerOrder> = {}): CustomerOrder {
  return {
    id: "bg-1",
    number: "83XZCKTF",
    placedAt: "2026-08-20T00:00:00.000Z",
    status: "confirmed",
    total: 79,
    currency: "USD",
    shippingStatus: "SHIPPED",
    trackingUrl: "https://t.17track.net/en#nums=ABC123",
    fulfilledAt: "2026-08-21T00:00:00.000Z",
    refundedAt: null,
    chargebackAt: null,
    refundAmount: null,
    chargebackAmount: null,
    saleOrigin: "Direct",
    platform: "BuyGoods · NerveCalm",
    platformKey: "buygoods:9938",
    paymentMethod: "card",
    address: "1 Main St",
    items: [],
    lockedFields: [],
    customerName: "Jane Doe",
    customerPhone: "+447713480000",
    email: "jane@x.com",
    shippingTrackingId: "ABC123",
    ...overrides,
  };
}

function makeCustomer(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: "cust-1",
    email: "jane@x.com",
    name: "Jane Doe",
    phone: "+447713480000",
    ordersCount: 1,
    totalSpent: 79,
    firstOrderAt: "2026-08-20T00:00:00.000Z",
    lastOrderAt: "2026-08-20T00:00:00.000Z",
    saleOrigin: "Direct",
    platforms: ["BuyGoods · NerveCalm"],
    platformKeys: ["buygoods:9938"],
    products: ["NerveCalm"],
    hasApp: true,
    onboarded: true,
    lastDoseDay: null,
    totalDoses: 0,
    churnFlag: false,
    reachable: false,
    userId: "user-1",
    orders: [makeOrder()],
    ...overrides,
  };
}

describe("isAwaitingShipment", () => {
  const now = new Date("2026-09-01T00:00:00.000Z");

  it("flags a confirmed, unfulfilled order placed more than 5 days ago", () => {
    expect(
      isAwaitingShipment({ status: "confirmed", fulfilledAt: null, placedAt: new Date("2026-08-20T00:00:00.000Z") }, now)
    ).toBe(true);
  });

  it("does not flag an order placed less than 5 days ago", () => {
    expect(
      isAwaitingShipment({ status: "confirmed", fulfilledAt: null, placedAt: new Date("2026-08-28T00:00:00.000Z") }, now)
    ).toBe(false);
  });

  it("does not flag a fulfilled order", () => {
    expect(
      isAwaitingShipment(
        { status: "confirmed", fulfilledAt: new Date("2026-08-21T00:00:00.000Z"), placedAt: new Date("2026-08-20T00:00:00.000Z") },
        now
      )
    ).toBe(false);
  });

  it("does not flag a non-confirmed order (e.g. shipped/canceled/refunded)", () => {
    expect(
      isAwaitingShipment({ status: "shipped", fulfilledAt: null, placedAt: new Date("2026-08-20T00:00:00.000Z") }, now)
    ).toBe(false);
  });
});

describe("matchCustomerForRequester", () => {
  const rows = [
    makeCustomer(),
    makeCustomer({ id: "cust-2", email: "phoneonly@x.com", phone: "+15551234567", name: "Phone Only" }),
    makeCustomer({ id: null, email: "legacy@x.com", name: "Legacy Row" }), // no customer id — must not be indexed
  ];
  const { byEmail, byPhoneDigits } = buildCustomerIndexes(rows);

  it("matches by email (case-insensitive)", () => {
    const match = matchCustomerForRequester({ email: "JANE@X.COM" }, byEmail, byPhoneDigits);
    expect(match?.id).toBe("cust-1");
  });

  it("falls back to matching by phone digits when there is no email match", () => {
    const match = matchCustomerForRequester({ email: "unknown@x.com", phone: "+1 (555) 123-4567" }, byEmail, byPhoneDigits);
    expect(match?.id).toBe("cust-2");
  });

  it("returns null when neither email nor phone match", () => {
    expect(matchCustomerForRequester({ email: "nobody@x.com", phone: "+19998887777" }, byEmail, byPhoneDigits)).toBeNull();
  });

  it("never links a legacy row with no customer id", () => {
    expect(matchCustomerForRequester({ email: "legacy@x.com" }, byEmail, byPhoneDigits)).toBeNull();
  });

  it("ignores short/junk phone numbers rather than false-matching", () => {
    expect(matchCustomerForRequester({ phone: "123" }, byEmail, byPhoneDigits)).toBeNull();
  });
});

describe("projectSupportCustomer", () => {
  it("projects the most recent order and refund/chargeback flags, without LTV/attribution", () => {
    const row = makeCustomer({
      orders: [
        makeOrder({ id: "bg-2", number: "NEWEST", placedAt: "2026-08-25T00:00:00.000Z" }),
        makeOrder({ id: "bg-1", number: "OLDEST", placedAt: "2026-08-01T00:00:00.000Z", chargebackAt: "2026-08-05T00:00:00.000Z" }),
      ],
    });
    const projected = projectSupportCustomer(row, 3);
    expect(projected.lastOrder?.number).toBe("NEWEST");
    expect(projected.openTickets).toBe(3);
    expect(projected.hasChargeback).toBe(true);
    expect(projected.hasRefund).toBe(false);
    expect(projected).not.toHaveProperty("totalSpent");
    expect(projected).not.toHaveProperty("saleOrigin");
  });

  it("humanizes the last order's shipping status", () => {
    const row = makeCustomer({ orders: [makeOrder({ shippingStatus: "OUT_FOR_DELIVERY" })] });
    expect(projectSupportCustomer(row, 0).lastOrder?.shippingStatusLabel).toBe("Out for delivery");
  });

  it("has a null lastOrder for a customer with no orders", () => {
    expect(projectSupportCustomer(makeCustomer({ orders: [] }), 0).lastOrder).toBeNull();
  });
});
