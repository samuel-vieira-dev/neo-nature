import { describe, expect, it } from "vitest";
import type { Customer, Order, User } from "@/db/schema";
import { applyFilters, foldCustomers, type CustomerRow } from "./crm";

// Fixture helpers — only the fields the fold reads matter; the rest is stubbed.
const order = (o: Partial<Order> & { id: string }): Order =>
  ({
    source: "buygoods",
    buygoodsOrderId: null,
    konnektiveOrderId: null,
    userId: null,
    customerId: null,
    buygoodsAccountId: null,
    buygoodsUserId: null,
    email: "",
    customerPhoneE164: null,
    number: o.id,
    placedAt: new Date("2026-01-01"),
    status: "confirmed",
    total: "10.00",
    currency: "USD",
    shippingStatus: null,
    shippingTrackingId: null,
    fulfilledAt: null,
    refundedAt: null,
    chargebackAt: null,
    refundAmount: null,
    chargebackAmount: null,
    address: "",
    customerName: "",
    customerPhone: null,
    saleOrigin: "Direct",
    paymentMethod: null,
    ...o,
  }) as Order;

const user = (u: Partial<User> & { id: string }): User =>
  ({
    email: null,
    phone: null,
    customerId: null,
    name: "",
    fullName: "",
    churnFlag: false,
    lastLoginAt: null,
    onboardedAt: null,
    ...u,
  }) as User;

const customer = (c: Partial<Customer> & { id: string }): Customer =>
  ({ primaryEmail: null, primaryPhone: null, name: "", mergedIntoId: null, ...c }) as Customer;

const fold = (orders: Order[], users: User[], customers: Customer[]): CustomerRow[] =>
  foldCustomers(orders, [], users, customers, [], []);

describe("foldCustomers", () => {
  it("groups by canonical customer_id across different emails", () => {
    const rows = fold(
      [
        order({ id: "o1", customerId: "C1", email: "a@x.com", total: "10.00" }),
        order({ id: "o2", customerId: "C1", email: "b@x.com", total: "5.00" }),
      ],
      [],
      [customer({ id: "C1", primaryEmail: "a@x.com", name: "Ann" })]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "C1", email: "a@x.com", ordersCount: 2, totalSpent: 15 });
  });

  it("bridges unstamped orders to an existing customer by primary email (no split rows)", () => {
    const rows = fold(
      [
        order({ id: "o1", customerId: "C1", email: "a@x.com" }),
        order({ id: "o2", customerId: null, email: "A@X.com" }), // pre-backfill row
      ],
      [],
      [customer({ id: "C1", primaryEmail: "a@x.com" })]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].ordersCount).toBe(2);
  });

  it("falls back to legacy email clustering when no customer row exists", () => {
    const rows = fold([order({ id: "o1", email: "Legacy@x.com", customerName: "Leg" })], [], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: null, email: "legacy@x.com", name: "Leg" });
  });

  it("email-less unstamped orders stay invisible (historical behavior)", () => {
    expect(fold([order({ id: "o1" })], [], [])).toHaveLength(0);
  });

  it("email-less orders WITH a customer_id do appear (new behavior)", () => {
    const rows = fold(
      [order({ id: "o1", customerId: "C2" })],
      [],
      [customer({ id: "C2", primaryPhone: "+15550009", name: "Phone Only" })]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "C2", email: "+15550009", phone: "+15550009" });
  });

  it("stamped user joins its customer row; unstamped SMS-only user follows the phone-matched order", () => {
    const rows = fold(
      [order({ id: "o1", customerId: "C1", email: "a@x.com", customerPhoneE164: "+15550001" })],
      [user({ id: "u1", phone: "+15550001", lastLoginAt: new Date() })],
      [customer({ id: "C1", primaryEmail: "a@x.com" })]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "C1", hasApp: true, userId: "u1" });
  });

  it("unstamped user with no orders keys off phone (legacy) and reports id null", () => {
    const rows = fold([], [user({ id: "u1", phone: "+15550002" })], []);
    expect(rows[0]).toMatchObject({ id: null, email: "+15550002" });
  });
});

describe("applyFilters phone search", () => {
  const rows = fold(
    [order({ id: "o1", customerId: "C1", email: "a@x.com", customerPhone: "+1 (555) 123-4567", customerPhoneE164: "+15551234567" })],
    [],
    [customer({ id: "C1", primaryEmail: "a@x.com" })]
  );

  it("matches on digit substrings of the phone", () => {
    expect(applyFilters(rows, { q: "555123" })).toHaveLength(1);
    expect(applyFilters(rows, { q: "(555) 123" })).toHaveLength(1);
  });

  it("does not phone-match short digit runs", () => {
    expect(applyFilters(rows, { q: "123" })).toHaveLength(0);
  });
});
