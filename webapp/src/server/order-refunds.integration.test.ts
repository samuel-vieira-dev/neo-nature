import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import { eq } from "drizzle-orm";
import { orders, orderRefunds, adminActionLogs } from "@/db/schema";
import type { AdminContext } from "./admin";

// Explicit opt-in: creates only an isolated, temporary local database.
describe.skipIf(process.env.RUN_REFUND_DB_TESTS !== "1")("refund database integration", () => {
  let pg: EmbeddedPostgres;
  let directory: string;
  let database: typeof import("@/db");
  let service: typeof import("./order-refunds");
  const admin = { id: "test-operator" } as AdminContext;
  const input = (amount = "30.00") => ({ requestId: randomUUID(), kind: "partial" as const, amount, reason: "Customer requested refund" });
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "neo-refunds-"));
    pg = new EmbeddedPostgres({ databaseDir: directory, user: "postgres", password: "postgres", port: 55439, persistent: false });
    await pg.initialise();
    await pg.start();
    const url = "postgresql://postgres:postgres@127.0.0.1:55439/postgres";
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("KONNEKTIVE_REFUND_MODE", "mock");
    execFileSync(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "push", "--force"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url, DRIZZLE_ENV: "test" }, stdio: "pipe" });
    database = await import("@/db");
    service = await import("./order-refunds");
  }, 60000);
  afterAll(async () => {
    if (database) await database.rawSql.end();
    if (pg) await pg.stop();
    if (directory) await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
  beforeEach(async () => {
    vi.stubEnv("KONNEKTIVE_REFUND_MOCK_RESULT", "success");
    vi.unstubAllGlobals();
    await database.db.delete(orderRefunds);
    await database.db.delete(adminActionLogs);
    await database.db.delete(orders);
    await database.db.insert(orders).values({ id: "kn-test", source: "konnektive", konnektiveOrderId: "TEST", number: "123", placedAt: new Date(), status: "confirmed", total: "100.00", productName: "Test" });
  });
  it("persists partials, returns idempotent retries and keeps real commerce unchanged", async () => {
    const first = input();
    const result = await service.processOrderRefund("kn-test", first, admin);
    expect(await service.processOrderRefund("kn-test", first, admin)).toEqual(result);
    expect((await service.refundSummary("kn-test")).available).toBe("70.00");
    await service.processOrderRefund("kn-test", { ...input("70.00"), kind: "full" }, admin);
    const summary = await service.refundSummary("kn-test");
    expect(summary.simulatedTotal).toBe("100.00");
    expect(summary.blockedReason).toBe("no_refundable_balance");
    const [order] = await database.db.select().from(orders);
    expect(order.status).toBe("confirmed");
    expect(order.refundAmount).toBeNull();
    expect(order.refundedAt).toBeNull();
    expect(await database.db.select().from(adminActionLogs)).toHaveLength(2);
  });
  it("serializes competing requests and prevents excess refunds", async () => {
    const results = await Promise.allSettled([service.processOrderRefund("kn-test", input("70"), admin), service.processOrderRefund("kn-test", input("70"), admin)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await service.refundSummary("kn-test")).available).toBe("30.00");
  });
  it("deduplicates simultaneous identical requests", async () => {
    const request = input();
    const [a, b] = await Promise.all([service.processOrderRefund("kn-test", request, admin), service.processOrderRefund("kn-test", request, admin)]);
    expect(a.id).toBe(b.id);
    expect(await database.db.select().from(orderRefunds)).toHaveLength(1);
    await expect(service.processOrderRefund("kn-test", { ...request, amount: "40" }, admin)).rejects.toThrow("idempotency_conflict");
  });
  it("rejects other origins on the server", async () => {
    await database.db.update(orders).set({ source: "buygoods" }).where(eq(orders.id, "kn-test"));
    await expect(service.processOrderRefund("kn-test", input(), admin)).rejects.toThrow("konnektive_orders_only");
    expect(await database.db.select().from(orderRefunds)).toHaveLength(0);
  });
  it("declines do not consume balance and uncertain results block retries with new keys", async () => {
    vi.stubEnv("KONNEKTIVE_REFUND_MOCK_RESULT", "decline");
    expect((await service.processOrderRefund("kn-test", input(), admin)).status).toBe("failed");
    expect((await service.refundSummary("kn-test")).available).toBe("100.00");
    vi.stubEnv("KONNEKTIVE_REFUND_MOCK_RESULT", "timeout");
    const request = input();
    expect((await service.processOrderRefund("kn-test", request, admin)).status).toBe("unknown");
    expect((await service.processOrderRefund("kn-test", request, admin)).status).toBe("unknown");
    await expect(service.processOrderRefund("kn-test", input(), admin)).rejects.toThrow("reconciliation_required");
  });
  it("reserves a live refund, checks upstream balance and never repeats the same request", async () => {
    vi.stubEnv("KONNEKTIVE_REFUND_MODE", "live");
    vi.stubEnv("KONNEKTIVE_API_LOGIN_ID", "test-user");
    vi.stubEnv("KONNEKTIVE_API_PASSWORD", "test-password");
    const responses = [
      { result: "SUCCESS", message: { data: [{ clientOrderId: "TEST", currencyCode: "USD", totalAmount: "100.00", refundRemaining: "100.00", orderStatus: "COMPLETE", reviewStatus: "APPROVED" }] } },
      { result: "SUCCESS", message: "Refund Successful" },
      { result: "SUCCESS", message: { data: [{ clientOrderId: "TEST", currencyCode: "USD", totalAmount: "100.00", refundRemaining: "70.00", orderStatus: "REFUNDED", reviewStatus: "APPROVED" }] } },
      { result: "SUCCESS", message: { data: [{ clientOrderId: "TEST", currencyCode: "USD", totalAmount: "100.00", refundRemaining: "70.00", orderStatus: "REFUNDED", reviewStatus: "APPROVED" }] } },
      { result: "SUCCESS", message: "Refund Successful" },
      { result: "SUCCESS", message: { data: [{ clientOrderId: "TEST", currencyCode: "USD", totalAmount: "100.00", refundRemaining: "0.00", orderStatus: "REFUNDED", reviewStatus: "APPROVED" }] } },
    ];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const params = new URLSearchParams(String(init.body));
      expect(params.get("loginId")).toBe("test-user");
      expect(params.get("password")).toBe("test-password");
      return Response.json(responses.shift());
    });
    vi.stubGlobal("fetch", fetchMock);
    const request = input();
    const result = await service.processOrderRefund("kn-test", request, admin);
    expect(result.status).toBe("succeeded");
    expect(result.message).toContain("70.00");
    expect((await service.processOrderRefund("kn-test", request, admin)).id).toBe(result.id);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const full = await service.processOrderRefund("kn-test", { ...input("70.00"), kind: "full" }, admin);
    expect(full.status).toBe("succeeded");
    expect(full.message).toContain("0.00");
    expect(fetchMock).toHaveBeenCalledTimes(6);
    const partialBody = new URLSearchParams(String(fetchMock.mock.calls[1]?.[1]?.body));
    const fullBody = new URLSearchParams(String(fetchMock.mock.calls[4]?.[1]?.body));
    expect(partialBody.get("refundAmount")).toBe("30.00");
    expect(partialBody.has("fullRefund")).toBe(false);
    expect(fullBody.get("fullRefund")).toBe("true");
    expect(fullBody.has("refundAmount")).toBe(false);
    expect((await database.db.select().from(orderRefunds))[0]?.mode).toBe("live");
    expect((await database.db.select().from(orders))[0]?.refundAmount).toBeNull();
  });
  it("blocks a new live request after an uncertain provider response", async () => {
    vi.stubEnv("KONNEKTIVE_REFUND_MODE", "live");
    vi.stubEnv("KONNEKTIVE_API_LOGIN_ID", "test-user");
    vi.stubEnv("KONNEKTIVE_API_PASSWORD", "test-password");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ result: "SUCCESS", message: { data: [{ clientOrderId: "TEST", currencyCode: "USD", totalAmount: "100.00", refundRemaining: "100.00", orderStatus: "COMPLETE", reviewStatus: "APPROVED" }] } })).mockRejectedValueOnce(new Error("timeout"));
    vi.stubGlobal("fetch", fetchMock);
    expect((await service.processOrderRefund("kn-test", input(), admin)).status).toBe("unknown");
    await expect(service.processOrderRefund("kn-test", input(), admin)).rejects.toThrow("reconciliation_required");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
