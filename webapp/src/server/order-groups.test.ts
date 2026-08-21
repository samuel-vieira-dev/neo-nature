import { describe, it, expect } from "vitest";
import { groupOrders, groupStatus, groupTotal, groupTrackingId, isAddOn, isAddOnCodename, ADDON_WINDOW_MS } from "./order-groups";

type Row = {
  id: string;
  placedAt: Date;
  productCodename: string;
  shippingTrackingId: string | null;
  status: string;
  total: string;
  upsellFlag: boolean | null;
  buygoodsAccountId: string | null;
  buygoodsUserId: string | null;
};

const t0 = new Date("2026-08-19T22:56:16Z");
const at = (iso: string) => new Date(iso);
const min = (n: number) => new Date(t0.getTime() + n * 60_000);

const row = (o: Partial<Row> & { id: string }): Row => ({
  placedAt: t0,
  productCodename: "neu6",
  shippingTrackingId: null,
  status: "confirmed",
  total: "294.00",
  upsellFlag: null,
  buygoodsAccountId: "11020",
  buygoodsUserId: "145886",
  ...o,
});

describe("isAddOnCodename / isAddOn", () => {
  it("flags u*/d* codenames as upsell/downsell (real production shapes)", () => {
    for (const c of ["u1_3neuro6_3", "u2_3zen6_3", "d1_3zen6_3", "d2_3burn6_3", "uneuro6_3_294", "unerve6_3_294", "U2_2GUT4_2"]) {
      expect(isAddOnCodename(c), c).toBe(true);
    }
  });
  it("leaves main products alone", () => {
    for (const c of ["zen6", "neu6", "sli6", "ncal6", "her6", "zen3_new", "sli3_207", "hero6_3_234", "293", "", null]) {
      expect(isAddOnCodename(c), String(c)).toBe(false);
    }
  });
  it("trusts the feed's flag_upsell over the codename", () => {
    expect(isAddOn({ upsellFlag: true, productCodename: "hero6_3_234" })).toBe(true);
    expect(isAddOn({ upsellFlag: false, productCodename: "zen6" })).toBe(false);
    expect(isAddOn({ upsellFlag: null, productCodename: "u1_3zen6_3" })).toBe(true);
  });
});

describe("groupOrders", () => {
  it("folds the upsell tail of one checkout session into the main order", () => {
    // real shape: neu6 22:56:16 → u1 22:56:27 → u2 23:02:49, same BuyGoods pair
    const main = row({ id: "bg-8YUZ8GMO", placedAt: at("2026-08-19T22:56:16Z") });
    const up1 = row({ id: "bg-8YUZ8GMS", productCodename: "u1_3neuro6_3", total: "293.99", placedAt: at("2026-08-19T22:56:27Z") });
    const up2 = row({ id: "bg-8YUZ8GMW", productCodename: "u2_3zen6_3", total: "234.00", placedAt: at("2026-08-19T23:02:49Z") });
    const groups = groupOrders([up2, main, up1]);
    expect(groups).toHaveLength(1);
    expect(groups[0].anchor.id).toBe("bg-8YUZ8GMO");
    expect(groups[0].members.map((m) => m.id)).toEqual(["bg-8YUZ8GMO", "bg-8YUZ8GMS", "bg-8YUZ8GMW"]);
  });

  it("keeps two checkout sessions an hour apart as two purchases (different BuyGoods user_id)", () => {
    const s1main = row({ id: "A", placedAt: at("2026-08-19T22:56:16Z") });
    const s1up1 = row({ id: "B", productCodename: "u1_3neuro6_3", placedAt: at("2026-08-19T22:56:27Z") });
    const s1up2 = row({ id: "C", productCodename: "u2_3zen6_3", placedAt: at("2026-08-19T23:02:49Z") });
    const s2main = row({ id: "D", placedAt: at("2026-08-20T00:10:24Z"), buygoodsUserId: "145898" });
    const s2up2 = row({ id: "E", productCodename: "u2_3zen6_3", placedAt: at("2026-08-20T00:10:56Z"), buygoodsUserId: "145898" });
    const groups = groupOrders([s2up2, s1up2, s2main, s1main, s1up1]);
    expect(groups.map((g) => g.members.map((m) => m.id))).toEqual([
      ["A", "B", "C"],
      ["D", "E"],
    ]);
  });

  it("without BuyGoods ids, an add-on still picks the CLOSEST main order", () => {
    const s1main = row({ id: "A", placedAt: min(0), buygoodsAccountId: null, buygoodsUserId: null });
    const s2main = row({ id: "D", placedAt: min(74), buygoodsAccountId: null, buygoodsUserId: null });
    const s2up = row({ id: "E", productCodename: "u2_3zen6_3", placedAt: min(75), buygoodsAccountId: null, buygoodsUserId: null });
    const groups = groupOrders([s1main, s2main, s2up]);
    expect(groups.map((g) => g.members.map((m) => m.id))).toEqual([["A"], ["D", "E"]]);
  });

  it("uses flag_upsell when the codename has no prefix", () => {
    const main = row({ id: "A", productCodename: "her6", upsellFlag: false });
    const up = row({ id: "B", productCodename: "hero6_3_234", upsellFlag: true, placedAt: min(1) });
    const [g] = groupOrders([main, up]);
    expect(g.members.map((m) => m.id)).toEqual(["A", "B"]);
    expect(g.anchor.id).toBe("A");
  });

  it("folds orders that share a tracking number even without an add-on signal or a near timestamp", () => {
    const a = row({ id: "A", shippingTrackingId: "GFUS01067937885313", status: "shipped" });
    const b = row({ id: "B", productCodename: "zen6", shippingTrackingId: "GFUS01067937885313", status: "shipped", placedAt: min(400), buygoodsUserId: "999" });
    expect(groupOrders([a, b])).toHaveLength(1);
  });

  it("keeps two separate main orders apart, even minutes apart", () => {
    const a = row({ id: "A", productCodename: "neu6" });
    const b = row({ id: "B", productCodename: "zen6", placedAt: min(5) });
    expect(groupOrders([a, b])).toHaveLength(2);
  });

  it("keeps an add-on apart when it is outside the window and has no shared tracking", () => {
    // real shape: u1_2nerve4_2 ~17h after the main sale, not yet shipped
    const main = row({ id: "A", productCodename: "ncal6", placedAt: at("2026-08-18T22:38:12Z") });
    const later = row({ id: "B", productCodename: "u1_2nerve4_2", placedAt: at("2026-08-19T16:20:52Z") });
    const groups = groupOrders([main, later]);
    expect(groups).toHaveLength(2);
    expect(groups[1].anchor.id).toBe("B"); // a lone add-on anchors itself
    expect(new Date(groups[1].anchor.placedAt).getTime() - main.placedAt.getTime()).toBeGreaterThan(ADDON_WINDOW_MS);
  });

  it("keeps a reorder weeks later as its own purchase", () => {
    const first = row({ id: "A", shippingTrackingId: "T1", status: "shipped" });
    const firstUp = row({ id: "B", productCodename: "u1_3neuro6_3", placedAt: min(2), shippingTrackingId: "T1", status: "shipped" });
    const reorder = row({ id: "C", placedAt: at("2026-09-12T10:00:00Z"), shippingTrackingId: "T2", status: "shipped", buygoodsUserId: "777" });
    const groups = groupOrders([reorder, firstUp, first]);
    expect(groups.map((g) => g.anchor.id)).toEqual(["A", "C"]);
    expect(groups[0].members).toHaveLength(2);
  });

  it("anchors on the main order even when the add-on row carries the earlier timestamp", () => {
    const up = row({ id: "B", productCodename: "u1_3neuro6_3", placedAt: min(0) });
    const main = row({ id: "A", productCodename: "neu6", placedAt: min(1) });
    const [g] = groupOrders([up, main]);
    expect(g.anchor.id).toBe("A");
    expect(g.members.map((m) => m.id)).toEqual(["B", "A"]);
  });

  it("returns an empty list for no orders", () => {
    expect(groupOrders([])).toEqual([]);
  });
});

describe("group aggregates", () => {
  const main = row({ id: "A", productCodename: "her6", status: "shipped", shippingTrackingId: "UUS68H6710943799882", total: "316.79" });
  const down1 = row({ id: "B", productCodename: "d1_3hero6_3", status: "shipped", shippingTrackingId: "UUS68H6710943799882", total: "187.49", placedAt: min(1) });
  const down2 = row({ id: "C", productCodename: "d2_3testo6_3", status: "refunded", total: "155.16", placedAt: min(3) });
  const canceled = row({ id: "D", productCodename: "d2_3gut6_3", status: "canceled", total: "144.00", placedAt: min(4) });

  it("takes the anchor's status while it is live, even if an add-on was refunded", () => {
    const [g] = groupOrders([main, down1, down2]);
    expect(groupStatus(g)).toBe("shipped");
  });

  it("falls back to a live sibling when the anchor itself ended (real case: main canceled, downsells shipped)", () => {
    const [g] = groupOrders([{ ...main, status: "canceled", shippingTrackingId: null }, down1]);
    expect(groupStatus(g)).toBe("shipped");
    const [g2] = groupOrders([{ ...main, status: "refunded" }, { ...down1, status: "refunded" }]);
    expect(groupStatus(g2)).toBe("refunded");
  });

  it("sums what was charged, skipping canceled rows", () => {
    const [g] = groupOrders([main, down1, down2, canceled]);
    expect(groupTotal(g)).toBeCloseTo(316.79 + 187.49 + 155.16);
  });

  it("exposes the shared tracking number", () => {
    const [g] = groupOrders([main, down1, down2]);
    expect(groupTrackingId(g)).toBe("UUS68H6710943799882");
    const [g2] = groupOrders([{ ...main, shippingTrackingId: null }, down1]);
    expect(groupTrackingId(g2)).toBe("UUS68H6710943799882");
  });
});
