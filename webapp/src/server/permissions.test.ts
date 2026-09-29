import { describe, expect, it } from "vitest";
import { editableOrderFields, hasPermission, PERMISSIONS, permissionsFor, type Permission } from "./permissions";

describe("permissionsFor", () => {
  it("admin has every permission", () => {
    expect(permissionsFor("admin")).toEqual(PERMISSIONS);
  });

  it("cs has the customer-support and full refund-management permissions", () => {
    expect(new Set(permissionsFor("cs"))).toEqual(
      new Set(["orders:read", "orders:send-refund-form", "customers:read", "customers:impersonate", "support:read", "refund-requests:read", "tickets:write", "orders:refund", "refund-form:write"])
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
  it("can read orders, refunds and support without write or CRM access", () => {
    const allowed: Permission[] = ["orders:read", "orders:send-refund-form", "support:read", "refund-requests:read"];
    expect(permissionsFor("tauk")).toEqual(allowed);
    for (const permission of PERMISSIONS) {
      expect(hasPermission("tauk", permission)).toBe(allowed.includes(permission));
    }
    expect(editableOrderFields("tauk")).toEqual([]);
  });
});
