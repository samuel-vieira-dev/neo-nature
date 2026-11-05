import { describe, expect, it } from "vitest";
import { citedOrder, ticketProductOrder } from "./support-ticket-product";

const order = (id: string, placedAt: string, extra: Partial<{ number: string; buygoodsOrderId: string; konnektiveOrderId: string }> = {}) => ({ id, number: null, buygoodsOrderId: null, konnektiveOrderId: null, placedAt: new Date(placedAt), ...extra });
const older = order("o-1", "2026-09-01", { buygoodsOrderId: "BG12345" });
const newer = order("o-2", "2026-10-15", { konnektiveOrderId: "K-98765" });

describe("ticket product", () => {
  it("uses the order cited in the message, by any of its ids", () => {
    expect(citedOrder("Where is order BG12345?", [newer, older])).toBe(older);
    expect(citedOrder("ref k-98765 please", [older, newer])).toBe(newer);
  });

  it("ignores partial matches and short ids", () => {
    expect(citedOrder("order BG123456", [older])).toBeUndefined();
    expect(citedOrder("o-1", [older])).toBeUndefined();
  });

  it("falls back to the most recent order, or none", () => {
    expect(ticketProductOrder("My bottle arrived damaged", [older, newer])).toBe(newer);
    expect(ticketProductOrder("About BG12345", [newer, older])).toBe(older);
    expect(ticketProductOrder("Hello", [])).toBeNull();
  });
});
