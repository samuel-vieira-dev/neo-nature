import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), user: vi.fn(), provision: vi.fn(), create: vi.fn(), destroy: vi.fn(), remove: vi.fn(), update: vi.fn(), allowed: true }));
vi.mock("@/server/purchase-access", async importOriginal => ({ ...await importOriginal<typeof import("@/server/purchase-access")>(), findPurchase: m.find }));
vi.mock("@/db", () => ({ db: { query: { users: { findFirst: m.user } }, update: () => ({ set: () => ({ where: m.update }) }) } }));
vi.mock("@/server/leads", () => ({ findOrProvisionAccount: m.provision }));
vi.mock("@/server/session", () => ({ createLinkSession: m.create, destroySession: m.destroy, REFUND_COOKIE: "nn_refund" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ delete: m.remove }) }));
vi.mock("@/server/rate-limit", () => ({ makeLimiter: () => ({ hit: () => ({ allowed: m.allowed }) }) }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); m.allowed = true; m.find.mockResolvedValue({ id: "o1", userId: "u1", email: "a@example.com" }); m.user.mockResolvedValue({ id: "u1" }); });
it("validates normalized credentials and removes them from the destination", async () => {
  const res = await GET(new Request("https://example.com/api/auth/link?order_id=42&email=A%40EXAMPLE.COM"));
  expect(m.find).toHaveBeenCalledWith("42", "a@example.com");
  expect(m.create).toHaveBeenCalledWith("u1", "o1");
  expect(res.headers.get("location")).toBe("/");
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  expect(m.remove).toHaveBeenCalledWith("nn_refund");
});
it("rejects missing credentials without looking up a purchase", async () => {
  const res = await GET(new Request("https://example.com/api/auth/link?order_id=42"));
  expect(res.headers.get("location")).toContain("/access-error");
  expect(m.find).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
});
it("rejects a mismatched order/email and clears the previous session", async () => {
  m.find.mockResolvedValue(null);
  const res = await GET(new Request("https://example.com/api/auth/link?order_id=42&email=a@example.com"));
  expect(res.headers.get("location")).toContain("/access-error");
  expect(m.destroy).toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
});
it("rate limits before looking up purchases", async () => {
  m.allowed = false;
  await GET(new Request("https://example.com/api/auth/link?order_id=42&email=a@example.com"));
  expect(m.find).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
});
it("provisions a first-time buyer and attaches the validated purchase before granting access", async () => {
  m.find.mockResolvedValue({ id: "o2", userId: null, email: "new@example.com", customerPhoneE164: null });
  m.provision.mockResolvedValue({ user: { id: "u2" }, provisioned: true });
  const res = await GET(new Request("https://example.com/api/auth/link?order_id=43&email=new%40example.com"));
  expect(res.headers.get("location")).toBe("/");
  expect(m.provision).toHaveBeenCalledWith({ email: "new@example.com", phone: null });
  expect(m.update).toHaveBeenCalledTimes(2);
  expect(m.update.mock.invocationCallOrder[0]).toBeLessThan(m.create.mock.invocationCallOrder[0]);
  expect(m.create).toHaveBeenCalledWith("u2", "o2");
});
it("keeps plus-addressed purchase emails intact", async () => {
  await GET(new Request("https://example.com/api/auth/link?order_id=42&email=buyer%2Bpurchase%40example.com"));
  expect(m.find).toHaveBeenCalledWith("42", "buyer+purchase@example.com");
});
it("uses a name from a verified link as the session display name", async () => {
  await GET(new Request("https://example.com/api/auth/link?order_id=42&email=a%40example.com&name=Robert%20McClure"));
  expect(m.create).toHaveBeenCalledWith("u1", "o1", false, "Robert McClure");
});
it("never redirects to the internal host supplied by the production proxy", async () => {
  const res = await GET(new Request("https://localhost:8080/api/auth/link?order_id=42&email=a%40example.com"));
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe("/");
  const invalid = await GET(new Request("https://localhost:8080/api/auth/link"));
  expect(invalid.headers.get("location")).toBe("/access-error");
});
