import { describe, it, expect } from "vitest";
import { purchaseOriginOf } from "./sales-platform";

describe("purchaseOriginOf", () => {
  it("names the client's known BuyGoods merchant accounts", () => {
    expect(purchaseOriginOf({ source: "buygoods", buygoodsAccountId: "11227" })).toEqual({
      key: "buygoods:11227",
      platform: "BuyGoods",
      account: "Zensulin",
      label: "BuyGoods · Zensulin",
    });
    expect(purchaseOriginOf({ source: "buygoods", buygoodsAccountId: "9938" }).label).toBe("BuyGoods · NerveCalm");
  });

  it("still shows an account it has no name for, rather than hiding it", () => {
    const o = purchaseOriginOf({ source: "buygoods", buygoodsAccountId: "44444" });
    expect(o.label).toBe("BuyGoods #44444");
    expect(o.key).toBe("buygoods:44444");
    expect(o.account).toBe("#44444");
  });

  it("falls back to the platform alone when the feed carries no merchant id", () => {
    expect(purchaseOriginOf({ source: "konnektive" })).toEqual({
      key: "konnektive",
      platform: "Konnektive",
      account: null,
      label: "Konnektive",
    });
    // BuyGoods cancel/refund tails sometimes drop account_id
    expect(purchaseOriginOf({ source: "buygoods", buygoodsAccountId: null }).label).toBe("BuyGoods");
    expect(purchaseOriginOf({ source: "buygoods", buygoodsAccountId: "  " }).label).toBe("BuyGoods");
  });

  it("renders an unknown platform instead of dropping the order", () => {
    expect(purchaseOriginOf({ source: "jvzoo" }).label).toBe("jvzoo");
  });
});
