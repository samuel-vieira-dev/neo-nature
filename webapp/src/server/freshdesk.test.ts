import { describe, it, expect } from "vitest";
import { buildTicketPayload } from "./freshdesk";

describe("buildTicketPayload", () => {
  it("maps kind to Freshdesk priority and always opens the ticket", () => {
    expect(buildTicketPayload({ email: "a@b.com", subject: "Hi", kind: "support" }).priority).toBe(1);
    expect(buildTicketPayload({ email: "a@b.com", subject: "Hi", kind: "billing" }).priority).toBe(2);
    expect(buildTicketPayload({ email: "a@b.com", subject: "Hi", kind: "refund" }).priority).toBe(3);
    expect(buildTicketPayload({ email: "a@b.com", subject: "Hi", kind: "support" }).status).toBe(2);
  });

  it("tags every ticket for the app + its kind", () => {
    expect(buildTicketPayload({ email: "a@b.com", subject: "Hi", kind: "refund" }).tags).toEqual([
      "neonature-app",
      "refund",
    ]);
  });

  it("appends the order number to the description, skipping the placeholder dash", () => {
    const withOrder = buildTicketPayload({ email: "a@b.com", subject: "Late", description: "where is it", kind: "support", orderNumber: "NN-10482" });
    expect(withOrder.description).toContain("where is it");
    expect(withOrder.description).toContain("Order: NN-10482");

    const noOrder = buildTicketPayload({ email: "a@b.com", subject: "Late", description: "where is it", kind: "support", orderNumber: "—" });
    expect(noOrder.description).not.toContain("Order:");
  });

  it("falls back to the subject when no description is given", () => {
    expect(buildTicketPayload({ email: "a@b.com", subject: "Broken bottle", kind: "support" }).description).toBe(
      "Broken bottle"
    );
  });
});
