import { describe, expect, it } from "vitest";
import { editableOrderFields, hasPermission, PERMISSIONS, permissionsFor, type Permission } from "./permissions";

describe("permissionsFor", () => {
  it("admin has every permission", () => {
    expect(permissionsFor("admin")).toEqual(PERMISSIONS);
  });

  it("cs has exactly the five customer-support permissions", () => {
    expect(new Set(permissionsFor("cs"))).toEqual(
      new Set(["customers:read", "customers:impersonate", "tickets:write", "orders:address", "orders:refund"])
    );
  });

  it("cs does not have admin-only permissions", () => {
    const adminOnly: Permission[] = [
      "push:send",
      "banners:write",
      "analytics:read",
      "customers:write",
      "orders:write",
      "admins:manage",
    ];
    for (const p of adminOnly) {
      expect(hasPermission("cs", p)).toBe(false);
    }
  });
});

describe("editableOrderFields", () => {
  it("cs may edit only the address", () => {
    expect(editableOrderFields("cs")).toEqual(["address"]);
  });

  it("admin may edit all five editable order fields", () => {
    expect(editableOrderFields("admin")).toEqual([
      "address",
      "customerName",
      "customerPhone",
      "email",
      "shippingTrackingId",
    ]);
  });
});
