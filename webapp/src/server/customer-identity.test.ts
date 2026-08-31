import { describe, expect, it } from "vitest";
import {
  clusterByLegacyRules,
  decideCustomer,
  type LegacyOrderKeys,
  type LegacyUserKeys,
} from "./customer-identity";

// ---------------------------------------------------------------------------
// decideCustomer — the merge policy matrix
// ---------------------------------------------------------------------------

describe("decideCustomer", () => {
  it("attaches by email when known", () => {
    expect(decideCustomer({ byEmail: "A", byBgPair: null, byPhone: null })).toEqual({
      action: "attach",
      customerId: "A",
      conflicts: [],
    });
  });

  it("new email + known phone attaches to the phone's customer (same person, new email)", () => {
    expect(decideCustomer({ byEmail: null, byBgPair: null, byPhone: "B" })).toEqual({
      action: "attach",
      customerId: "B",
      conflicts: [],
    });
  });

  it("falls back to the BuyGoods pair before the phone", () => {
    expect(decideCustomer({ byEmail: null, byBgPair: "P", byPhone: "B" })).toEqual({
      action: "attach",
      customerId: "P",
      conflicts: ["B"],
    });
  });

  it("creates when nothing is known", () => {
    expect(decideCustomer({ byEmail: null, byBgPair: null, byPhone: null })).toEqual({ action: "create" });
  });

  it("conflict email→A phone→B: email wins, B reported, never merged", () => {
    const d = decideCustomer({ byEmail: "A", byBgPair: null, byPhone: "B" });
    expect(d).toEqual({ action: "attach", customerId: "A", conflicts: ["B"] });
  });

  it("agreeing candidates report no conflict", () => {
    expect(decideCustomer({ byEmail: "A", byBgPair: "A", byPhone: "A" })).toEqual({
      action: "attach",
      customerId: "A",
      conflicts: [],
    });
  });
});

// ---------------------------------------------------------------------------
// clusterByLegacyRules — must mirror the historical crm.ts clustering
// ---------------------------------------------------------------------------

const order = (o: Partial<LegacyOrderKeys> & { id: string }): LegacyOrderKeys => ({
  email: "",
  customerPhoneE164: null,
  customerName: "",
  placedAt: new Date("2026-01-01"),
  ...o,
});
const user = (u: Partial<LegacyUserKeys> & { id: string }): LegacyUserKeys => ({
  email: null,
  phone: null,
  fullName: "",
  ...u,
});

describe("clusterByLegacyRules", () => {
  it("clusters orders by lowercased email; latest snapshot wins", () => {
    const { clusters } = clusterByLegacyRules(
      [
        order({ id: "o1", email: "Ann@x.com", customerName: "Ann Old", placedAt: new Date("2026-01-01") }),
        order({ id: "o2", email: "ann@X.com", customerName: "Ann New", customerPhoneE164: "+15550001", placedAt: new Date("2026-02-01") }),
      ],
      []
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ key: "ann@x.com", name: "Ann New", phone: "+15550001", orderIds: ["o1", "o2"] });
  });

  it("two emails stay two clusters (no phone-based auto-merge in legacy)", () => {
    const { clusters } = clusterByLegacyRules(
      [
        order({ id: "o1", email: "a@x.com", customerPhoneE164: "+15550001" }),
        order({ id: "o2", email: "b@x.com", customerPhoneE164: "+15550001" }),
      ],
      []
    );
    expect(clusters.map((c) => c.key).sort()).toEqual(["a@x.com", "b@x.com"]);
  });

  it("SMS-only user joins the cluster of the order paid with the same phone", () => {
    const { clusters } = clusterByLegacyRules(
      [order({ id: "o1", email: "ann@x.com", customerPhoneE164: "+15550001" })],
      [user({ id: "u1", phone: "+15550001" })]
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ key: "ann@x.com", userIds: ["u1"] });
  });

  it("SMS-only user with no matching order keys off the phone itself", () => {
    const { clusters } = clusterByLegacyRules([], [user({ id: "u1", phone: "+15550002", fullName: "Bo" })]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ key: "+15550002", phone: "+15550002", name: "Bo", email: null });
  });

  it("user with neither email nor phone keys off its own id", () => {
    const { clusters } = clusterByLegacyRules([], [user({ id: "u9" })]);
    expect(clusters[0].key).toBe("u9");
  });

  it("orders without email become orphans (legacy CRM dropped them)", () => {
    const { clusters, orphanOrders } = clusterByLegacyRules(
      [order({ id: "o1" }), order({ id: "o2", email: "a@x.com" })],
      []
    );
    expect(orphanOrders.map((o) => o.id)).toEqual(["o1"]);
    expect(clusters).toHaveLength(1);
  });

  it("phone lookup for SMS-only users ignores email-less orders (fixed legacy edge)", () => {
    const { clusters } = clusterByLegacyRules(
      [order({ id: "o1", customerPhoneE164: "+15550001" })], // no email
      [user({ id: "u1", phone: "+15550001" })]
    );
    // the user must NOT key off the empty string
    expect(clusters.find((c) => c.userIds.includes("u1"))!.key).toBe("+15550001");
  });
});
