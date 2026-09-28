import { describe, expect, it } from "vitest";
import { editableOrderFields, hasPermission, PERMISSIONS, permissionsFor, type Permission } from "./permissions";

describe("permissionsFor", () => {
  it("admin has every permission", () => {
    expect(permissionsFor("admin")).toEqual(PERMISSIONS);
  });

  it("cs has the customer-support and full refund-management permissions", () => {
    expect(new Set(permissionsFor("cs"))).toEqual(
      new Set(["orders:read", "orders:send-refund-form", "customers:read", "customers:impersonate", "tickets:write", "orders:refund", "refund-form:write"])
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
  it("cs cannot edit order fields", () => {
    expect(editableOrderFields("cs")).toEqual([]);
  });

  it("admin may edit non-address order fields", () => {
    expect(editableOrderFields("admin")).toEqual([
      "customerName",
      "customerPhone",
      "email",
      "shippingTrackingId",
    ]);
  });
});


describe("Tauk access boundary", () => {
  it("can only read orders and send the refund form", () => {
    expect(permissionsFor("tauk")).toEqual(["orders:read", "orders:send-refund-form"]);
    for (const permission of PERMISSIONS) {
      expect(hasPermission("tauk", permission)).toBe(permission === "orders:read" || permission === "orders:send-refund-form");
    }
    expect(editableOrderFields("tauk")).toEqual([]);
  });
});
