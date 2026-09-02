import { describe, expect, it } from "vitest";
import { ORDER_LOCK_COLUMNS, stripLockedFields } from "./field-locks";

describe("stripLockedFields", () => {
  it("returns everything when there are no locks", () => {
    const patch = { address: "123 Main St", shippingStatus: "Shipped" };
    expect(stripLockedFields(patch, [])).toEqual(patch);
    expect(stripLockedFields(patch, null)).toEqual(patch);
    expect(stripLockedFields(patch, undefined)).toEqual(patch);
  });

  it("a lock on address removes only address", () => {
    const patch = { address: "123 Main St", shippingStatus: "Shipped" };
    expect(stripLockedFields(patch, ["address"])).toEqual({ shippingStatus: "Shipped" });
  });

  it("a lock on customerPhone removes both customerPhone and customerPhoneE164", () => {
    const patch = { customerPhone: "555-1234", customerPhoneE164: "+15551234", status: "confirmed" };
    expect(stripLockedFields(patch, ["customerPhone"])).toEqual({ status: "confirmed" });
  });

  it("an unmapped lock name removes the column of the same name", () => {
    const patch = { someField: "value", other: "kept" };
    expect(stripLockedFields(patch, ["someField"])).toEqual({ other: "kept" });
  });

  it("does not mutate the input object", () => {
    const patch = { address: "123 Main St", shippingStatus: "Shipped" };
    const copy = { ...patch };
    stripLockedFields(patch, ["address"]);
    expect(patch).toEqual(copy);
  });

  it("uses ORDER_LOCK_COLUMNS as the default map", () => {
    expect(ORDER_LOCK_COLUMNS.customerPhone).toEqual(["customerPhone", "customerPhoneE164"]);
  });
});
