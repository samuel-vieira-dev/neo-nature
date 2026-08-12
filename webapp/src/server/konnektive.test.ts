import { describe, it, expect, afterEach } from "vitest";
import { normalize } from "./konnektive-parse";

// Fixtures mirror real captures from /webhook-konnektive field for field, with
// customer identity replaced by fakes — real names, emails, addresses and card
// digits don't belong in the repo. Order ids, campaigns, totals and status
// values are kept verbatim, since those are what the parsing depends on.

/** Proxy feed: nested items[]/fulfillments[] + flattened aliases + proxy* meta. */
const proxySale = {
  orderId: "F5A8CD676F",
  actualOrderId: 5311,
  clientOrderId: "F5A8CD676F",
  dateCreated: "2026-08-11 15:31:17",
  orderType: "NEW_SALE",
  orderStatus: "COMPLETE",
  totalAmount: "294.00",
  campaignName: "NerveCalm -V2",
  campaignId: 14,
  emailAddress: "Buyer.One@example.com",
  phoneNumber: "4074031778",
  name: "Buyer One",
  firstName: "Buyer",
  lastName: "One",
  shipAddress1: "1 Test St",
  shipCity: "Sanford",
  shipState: "FL",
  shipCountry: "US",
  shipPostalCode: "32771",
  paySource: "CREDITCARD",
  cardType: "MASTERCARD",
  currencyCode: "USD",
  affId: null,
  items: [
    {
      productId: 293,
      name: "NerveCalm - 6 Bottles",
      qty: 1,
      price: 294,
      productSku: "NERVE1",
      productType: "OFFER",
    },
  ],
  fulfillments: [
    {
      fulfillmentId: 4481,
      company: "Jet Pack",
      trackingNumber: null,
      dateShipped: null,
      status: "HOLD",
      items: [{ name: "NerveCalm", sku: "NERVE1", qty: "6", status: "HOLD" }],
    },
  ],
  order_id: "5311",
  canonical_order_id: "F5A8CD676F",
  campaign_id: "14",
  email: "Buyer.One@example.com",
  tracking_number: "",
  fulfillment_status: "HOLD",
  products_text: "NerveCalm - 6 Bottles",
  customerType: "SALE",
  proxyEvent: "compra",
  proxyReplay: true,
  product_name: "NerveCalm - 6 Bottles",
  product_price: "294",
  product_qty: "1",
  product_id: "293",
};

/** Direct feed, fulfillment event: flat camelCase, no items[], carries tracking. */
const directFulfillment = {
  acquisitionDate: "2026-08-05 18:50:48",
  campaignId: 27,
  campaignName: "HeroUp-V3",
  clientOrderId: "35EB8A9C67",
  orderId: 5085,
  originalOrderId: "5085",
  customerType: "FULFILLMENT",
  orderStatus: "COMPLETE",
  fulfillmentStatus: "SHIPPED",
  trackingNumber: "GM5453696800328302",
  dateCreated: "2026-08-05 18:50:48",
  orderTotal: "294.00",
  totalPrice: "294.00",
  basePrice: "294.00",
  currencyCode: "USD",
  emailAddress: "buyer.two@example.com",
  phoneNumber: "61418100068",
  fullName: "Buyer Two",
  firstName: "Buyer",
  lastName: "Two",
  shipAddress1: "2 Test St",
  shipCity: "New Gisborne",
  shipState: "VIC",
  shipCountry: "AU",
  shipPostalCode: "3438",
  paySource: "CREDITCARD",
  sourceId: 2,
  affId: "B2B79A36",
  subAffId: "6a73bcdb39047ea15a32b6db",
  sourceValue1: "CP01_HU_NEO100_BM130004_CBO_1-5-2_30/07",
  declineReason: "Approved",
};

/** Direct feed, abandoned checkout — no purchase happened. */
const directPartial = {
  acquisitionDate: "2026-08-11 11:50:38",
  campaignId: 27,
  campaignName: "HeroUp-V3",
  clientOrderId: "FE4F815725",
  orderId: 5309,
  customerType: "PARTIAL",
  orderStatus: "PARTIAL",
  declineReason: "Unknown Error",
  totalPrice: "0.00",
  basePrice: "0.00",
  currencyCode: "USD",
  emailAddress: "buyer.three@example.com",
  phoneNumber: "15208502218",
  fullName: "Buyer Three",
  shipCountry: "US",
};

/** Direct feed, upsell: orderTotal stays at the original sale, totalPrice grows. */
const directUpsell = {
  ...directFulfillment,
  clientOrderId: "75764833F7",
  orderId: 5279,
  customerType: "UPSELL",
  orderStatus: "COMPLETE",
  fulfillmentStatus: "PENDING",
  trackingNumber: undefined,
  orderTotal: "294.00",
  totalPrice: "587.99",
  basePrice: "587.99",
};

const ok = (r: ReturnType<typeof normalize>) => {
  if (!r.ok) throw new Error(`expected normalize to succeed, got: ${r.reason}`);
  return r.order;
};

afterEach(() => {
  delete process.env.KONNEKTIVE_CAMPAIGN_IDS;
});

describe("normalize — partial checkouts", () => {
  it("refuses a PARTIAL order: it is an abandoned cart, not a purchase", () => {
    const r = normalize(directPartial);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("partial");
  });

  it("refuses it on customerType alone, even if orderStatus looks complete", () => {
    expect(normalize({ ...directPartial, orderStatus: "COMPLETE" }).ok).toBe(false);
  });
});

describe("normalize — the two feed shapes agree on identity", () => {
  it("keys the proxy feed on clientOrderId, not the numeric id", () => {
    const o = ok(normalize(proxySale));
    expect(o.clientOrderId).toBe("F5A8CD676F");
    expect(o.number).toBe("5311");
  });

  it("keys the direct feed on clientOrderId even though orderId is numeric there", () => {
    const o = ok(normalize(directFulfillment));
    expect(o.clientOrderId).toBe("35EB8A9C67");
    expect(o.number).toBe("5085");
  });
});

describe("normalize — status", () => {
  it("treats HOLD as confirmed: the fulfillment house has it but nothing shipped", () => {
    expect(ok(normalize(proxySale)).status).toBe("confirmed");
  });

  it("treats SHIPPED with a tracking number as shipped", () => {
    const o = ok(normalize(directFulfillment));
    expect(o.status).toBe("shipped");
    expect(o.shippingTrackingId).toBe("GM5453696800328302");
  });

  it("treats PENDING with no tracking as confirmed", () => {
    expect(ok(normalize(directUpsell)).status).toBe("confirmed");
  });

  it("maps refunds and cancellations off orderStatus", () => {
    expect(ok(normalize({ ...directFulfillment, orderStatus: "REFUNDED" })).status).toBe("refunded");
    expect(ok(normalize({ ...directFulfillment, orderStatus: "CANCELLED" })).status).toBe("canceled");
  });

  it("maps a chargeback to refunded status but flags isChargeback, unlike a plain refund", () => {
    const chargeback = ok(normalize({ ...directFulfillment, orderStatus: "CHARGEBACK" }));
    expect(chargeback.status).toBe("refunded");
    expect(chargeback.isChargeback).toBe(true);

    const refund = ok(normalize({ ...directFulfillment, orderStatus: "REFUNDED" }));
    expect(refund.isChargeback).toBe(false);
  });
});

describe("normalize — refund amount", () => {
  it("is null when the feed doesn't report one, not the full order total", () => {
    expect(ok(normalize({ ...directFulfillment, orderStatus: "REFUNDED" })).refundAmount).toBeNull();
  });

  it("picks up a reported refund amount, which may be partial", () => {
    const o = ok(normalize({ ...directFulfillment, orderStatus: "REFUNDED", refundAmount: "147.00" }));
    expect(o.refundAmount).toBe("147.00");
  });
});

describe("normalize — totals", () => {
  it("takes totalAmount on the proxy feed", () => {
    expect(ok(normalize(proxySale)).total).toBe("294.00");
  });

  it("takes the running total on an upsell, not the original sale amount", () => {
    expect(ok(normalize(directUpsell)).total).toBe("587.99");
  });
});

describe("normalize — items", () => {
  it("reads the nested line items from the proxy feed", () => {
    const o = ok(normalize(proxySale));
    expect(o.items).toEqual([
      { productId: "293", name: "NerveCalm - 6 Bottles", sku: "NERVE1", qty: 1, price: "294.00" },
    ]);
  });

  it("returns no items for the direct feed rather than inventing a line", () => {
    expect(ok(normalize(directFulfillment)).items).toEqual([]);
  });
});

describe("normalize — customer", () => {
  it("lowercases the email and normalizes a bare 10-digit US phone", () => {
    const o = ok(normalize(proxySale));
    expect(o.email).toBe("buyer.one@example.com");
    expect(o.customerPhoneE164).toBe("+14074031778");
  });

  it("keeps an international number intact", () => {
    expect(ok(normalize(directFulfillment)).customerPhoneE164).toBe("+61418100068");
  });

  it("builds the shipping address from the ship* fields", () => {
    expect(ok(normalize(proxySale)).address).toBe("1 Test St, Sanford, FL, 32771, US");
  });
});

describe("normalize — replay", () => {
  it("flags a proxy backfill so the ingest stays silent", () => {
    expect(ok(normalize(proxySale)).isReplay).toBe(true);
  });

  it("flags a replay from the header too", () => {
    expect(ok(normalize(directFulfillment, { replayHeader: true })).isReplay).toBe(true);
  });

  it("treats a live event as not a replay", () => {
    expect(ok(normalize(directFulfillment)).isReplay).toBe(false);
  });
});

describe("normalize — campaign allowlist", () => {
  it("accepts every campaign when unset", () => {
    expect(normalize(proxySale).ok).toBe(true);
    expect(normalize(directFulfillment).ok).toBe(true);
  });

  it("rejects a campaign outside the allowlist", () => {
    process.env.KONNEKTIVE_CAMPAIGN_IDS = "14";
    expect(normalize(proxySale).ok).toBe(true);
    const r = normalize(directFulfillment);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("27");
  });
});

describe("normalize — junk input", () => {
  it("rejects a payload with no clientOrderId", () => {
    expect(normalize({ orderId: 5311, orderStatus: "COMPLETE" }).ok).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(normalize(null).ok).toBe(false);
    expect(normalize("nope").ok).toBe(false);
    expect(normalize([]).ok).toBe(false);
  });
});
