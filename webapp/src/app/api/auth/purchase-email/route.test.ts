import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), order: vi.fn(), create: vi.fn(), allowed: true }));
vi.mock("@/db", () => ({ db: { query: { orders: { findFirst: m.order } } } }));
vi.mock("@/server/session", () => ({
  withUser: (handler: (user: { id: string }, req?: Request) => Promise<Response>) => (req?: Request) => handler({ id: "u1" }, req),
  linkSession: m.session, createLinkSession: m.create,
}));
vi.mock("@/server/rate-limit", () => ({ makeLimiter: () => ({ hit: () => ({ allowed: m.allowed }) }) }));
import { GET, POST } from "./route";
const request = (email: string) => new Request("https://example.com/api/auth/purchase-email", { method: "POST", body: JSON.stringify({ email }) });
beforeEach(() => {
  vi.clearAllMocks(); m.allowed = true;
  m.session.mockResolvedValue({ userId: "u1", orderId: "o1", confirmed: false });
  m.order.mockResolvedValue({ id: "o1", userId: "u1", email: "Buyer@example.com" });
});
it("reports confirmation is needed", async () => {
  expect(await (await GET()).json()).toEqual({ required: true });
});
it("matches the purchase email regardless of case and spaces", async () => {
  expect((await POST(request(" BUYER@EXAMPLE.COM "))).status).toBe(200);
  expect(m.create).toHaveBeenCalledWith("u1", "o1", true);
});
it("does not grant access for the wrong email", async () => {
  expect((await POST(request("other@example.com"))).status).toBe(403);
  expect(m.create).not.toHaveBeenCalled();
});
it("does not grant access after a purchase is reassigned", async () => {
  m.order.mockResolvedValue({ id: "o1", userId: "u2", email: "buyer@example.com" });
  expect((await POST(request("buyer@example.com"))).status).toBe(403);
  expect(m.create).not.toHaveBeenCalled();
});
it("throttles repeated attempts", async () => {
  m.allowed = false;
  expect((await POST(request("buyer@example.com"))).status).toBe(429);
  expect(m.create).not.toHaveBeenCalled();
});
