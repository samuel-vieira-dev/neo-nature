import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasPermission, type Role, type Permission } from "@/server/permissions";
const mocks = vi.hoisted(() => ({ role: "tauk" as Role | null, order: vi.fn(), send: vi.fn(), audit: vi.fn() }));
vi.mock("@/server/admin", () => ({
  withAdmin: (fn: (...args: unknown[]) => Promise<Response>, permission: Permission) => (...args: unknown[]) =>
    mocks.role && hasPermission(mocks.role, permission) ? fn({ id: "agent", role: mocks.role }, ...args) : Promise.resolve(Response.json({ error: "forbidden" }, { status: 403 })),
  logAdminAction: mocks.audit,
}));
vi.mock("@/db", () => ({ db: { query: { orders: { findFirst: mocks.order } } } }));
vi.mock("@/server/refund-form-email", async (original) => ({ ...await original<typeof import("@/server/refund-form-email")>(), sendRefundFormEmail: mocks.send }));
import { POST } from "./route";
const ctx = { params: Promise.resolve({ id: "kn-ABC" }) };
const req = () => new Request("http://localhost/api/admin/orders/kn-ABC/refund-form", { method: "POST", body: JSON.stringify({ email: "override@example.com", refundPath: "https://evil.example" }) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.role = "tauk";
  mocks.order.mockResolvedValue({ id: "kn-ABC", number: "42", customerName: "Test Customer", email: " customer@example.com " });
  mocks.send.mockResolvedValue({ status: "not_configured" });
  mocks.audit.mockResolvedValue(undefined);
});
describe("refund form email endpoint", () => {
  it("rejects unauthenticated callers before reading orders or sending", async () => {
    mocks.role = null;
    expect((await POST(req(), ctx)).status).toBe(403);
    expect(mocks.order).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("returns integration pending without claiming success and ignores client destination overrides", async () => {
    const response = await POST(req(), ctx);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "integration_not_configured", email: "customer@example.com" });
    expect(mocks.send).toHaveBeenCalledWith({ requestId: expect.any(String), orderId: "kn-ABC", orderNumber: "42", customerName: "Test Customer", email: "customer@example.com", refundPath: "/refund?order_id=kn-ABC" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ id: "agent" }), "order.refund_form_email", expect.objectContaining({ metadata: expect.objectContaining({ status: "not_configured" }) }));
  });
  it("only reports success after provider confirmation", async () => {
    mocks.send.mockResolvedValue({ status: "sent", messageId: "gmail-1" });
    const response = await POST(req(), ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, email: "customer@example.com" });
  });
  it("does not encourage a duplicate send when auditing fails after delivery", async () => {
    mocks.send.mockResolvedValue({ status: "sent", messageId: "gmail-1" });
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(req(), ctx)).status).toBe(200);
    spy.mockRestore();
  });
  it.each(["failed", "throw"])("handles provider failure: %s", async (mode) => {
    if (mode === "throw") mocks.send.mockRejectedValue(new Error("network error"));
    else mocks.send.mockResolvedValue({ status: "failed" });
    const response = await POST(req(), ctx);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "send_failed", email: "customer@example.com" });
  });
  it("does not send for missing orders", async () => {
    mocks.order.mockResolvedValue(null);
    expect((await POST(req(), ctx)).status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send to invalid emails", async () => {
    mocks.order.mockResolvedValue({ id: "kn-ABC", email: "not-an-email" });
    expect((await POST(req(), ctx)).status).toBe(422);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
