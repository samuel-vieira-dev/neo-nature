import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permitted: true, process: vi.fn(), summary: vi.fn() }));
vi.mock("@/server/admin", () => ({ withAdmin: (fn: (...args: unknown[]) => Promise<Response>, permission: string) => (...args: unknown[]) => {
  expect(permission).toBe("orders:refund");
  return mocks.permitted ? fn({ id: "staff" }, ...args) : Promise.resolve(Response.json({ error: "forbidden" }, { status: 403 }));
} }));
vi.mock("@/server/order-refunds", () => ({ processOrderRefund: mocks.process, refundSummary: mocks.summary }));
import { GET, POST } from "./route";
import { RefundError } from "@/server/order-refund-policy";
const ctx = { params: Promise.resolve({ id: "order-1" }) };
const valid = { requestId: "181772ca-1911-46f6-88ba-45e5fc737898", kind: "partial", amount: "10", reason: "Requested refund" };
const req = (body: unknown) => new Request("http://localhost/api/admin/orders/order-1/refunds", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.permitted = true; });
describe("refund route", () => {
  it("requires refund permission for reads and writes", async () => {
    mocks.permitted = false;
    expect((await POST(req(valid), ctx)).status).toBe(403);
    expect((await GET(new Request("http://localhost"), ctx)).status).toBe(403);
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.summary).not.toHaveBeenCalled();
  });
  it("rejects malformed and client-overridden parameters", async () => {
    expect((await POST(req({ ...valid, mode: "live" }), ctx)).status).toBe(400);
    expect((await POST(req({ ...valid, amount: -10 }), ctx)).status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it("returns origin rejection from backend", async () => {
    mocks.process.mockRejectedValueOnce(new RefundError("konnektive_orders_only"));
    const response = await POST(req(valid), ctx);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "konnektive_orders_only" });
  });
  it("returns stored result and disables caching", async () => {
    mocks.process.mockResolvedValueOnce({ status: "succeeded", mode: "mock" });
    const response = await POST(req(valid), ctx);
    expect(await response.json()).toEqual({ status: "succeeded", mode: "mock" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
