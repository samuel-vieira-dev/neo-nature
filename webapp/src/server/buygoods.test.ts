import { describe, it, expect } from "vitest";
import { parseIpnParams } from "./buygoods";

// Field shapes mirror real captures from /webhook-buygoods-info (identity
// faked, structure verbatim): BuyGoods posts form-urlencoded, the n8n relay
// posts the same fields as JSON.

const formBody =
  "order_id_global=95RZ48EC&account_id=11227&action_type=refund" +
  "&customer_emailaddress=buyer%40example.com&total_clean=293.99";

const n8nBody = JSON.stringify({
  action_type: "fulfillment",
  order_id_global: "983Z8053",
  customer_emailaddress: "buyer@example.com",
  shipping_tracking_id: "GFUS01067520403904",
  was_fulfilled: "2",
  total_amount_charged: 213.21, // n8n emits some numerics unquoted
  is_test: "0",
  extra_nested: { ignore: "me" }, // objects are dropped, not stringified
  empty: null,
});

describe("parseIpnParams", () => {
  it("parses form-urlencoded bodies (BuyGoods direct)", () => {
    const p = parseIpnParams({ event: "refund" }, formBody);
    expect(p.order_id_global).toBe("95RZ48EC");
    expect(p.customer_emailaddress).toBe("buyer@example.com");
    expect(p.event).toBe("refund"); // query fills gaps
  });

  it("parses JSON bodies (n8n relay), coercing numbers to strings", () => {
    const p = parseIpnParams({ event: "fulfilled" }, n8nBody);
    expect(p.order_id_global).toBe("983Z8053");
    expect(p.shipping_tracking_id).toBe("GFUS01067520403904");
    expect(p.total_amount_charged).toBe("213.21");
    expect(p.extra_nested).toBeUndefined();
    expect(p.empty).toBeUndefined();
    expect(p.event).toBe("fulfilled");
  });

  it("body wins over query on conflicts, for both shapes", () => {
    expect(parseIpnParams({ order_id_global: "FROMQUERY" }, formBody).order_id_global).toBe("95RZ48EC");
    expect(parseIpnParams({ order_id_global: "FROMQUERY" }, n8nBody).order_id_global).toBe("983Z8053");
  });

  it("falls back to form parsing when a body merely looks like JSON", () => {
    const p = parseIpnParams({}, "{not=json&order_id_global=8YUZ8EC4");
    expect(p.order_id_global).toBe("8YUZ8EC4");
  });
});
