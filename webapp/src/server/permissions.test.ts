import { describe, expect, it } from "vitest";
import { editableOrderFields, hasPermission, PERMISSIONS, permissionsFor, type Permission } from "./permissions";

describe("permissionsFor", () => {
  it("admin has every permission", () => {
    expect(permissionsFor("admin")).toEqual(PERMISSIONS);
  });

  it("cs has the customer-support and full refund-management permissions", () => {
    expect(new Set(permissionsFor("cs"))).toEqual(
      new Set(["orders:read", "orders:send-refund-form", "customers:read", "customers:impersonate", "support:read", "reports:read", "refund-requests:read", "tickets:write", "orders:refund", "refund-form:write"])
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
      "reports:export",
    ];
    for (const p of adminOnly) {
      expect(hasPermission("cs", p)).toBe(false);
    }
  });
});

describe("support reports", () => {
  it("admin and cs see the reports; only admin exports them", () => {
    expect(hasPermission("cs", "reports:read")).toBe(true);
    expect(hasPermission("tauk", "reports:read")).toBe(false);
    expect(hasPermission("admin", "reports:export")).toBe(true);
    expect(hasPermission("cs", "reports:export")).toBe(false);
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
