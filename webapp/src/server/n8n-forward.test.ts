import { describe, it, expect, vi, afterEach } from "vitest";
import { classifyBuyGoodsEvent, forwardToN8n, isN8nForwardEnabled } from "./n8n-forward";

// Field shapes mirror src/server/buygoods.test.ts — real captures from
// /webhook-buygoods-info (identity faked, structure verbatim).

describe("classifyBuyGoodsEvent", () => {
  it("routes a new sale to orders", () => {
    expect(
      classifyBuyGoodsEvent({ order_id_global: "95RZ48EC", action_type: "sale", customer_emailaddress: "a@b.com" })
    ).toBe("orders");
  });

  it("routes a fulfillment/tracking update to orders", () => {
    expect(
      classifyBuyGoodsEvent({
        order_id_global: "983Z8053",
        action_type: "fulfillment",
        shipping_tracking_id: "GFUS01067520403904",
        was_fulfilled: "1",
      })
    ).toBe("orders");
  });

  it("routes a cancellation to orders (not a refund/chargeback)", () => {
    expect(classifyBuyGoodsEvent({ order_id_global: "8YUZ8EC4", was_canceled: "1" })).toBe("orders");
  });

  it("routes a merchant refund to refunds", () => {
    expect(classifyBuyGoodsEvent({ order_id_global: "95RZ48EC", action_type: "refund" })).toBe("refunds");
  });

  it("routes a chargeback to chargebacks", () => {
    expect(classifyBuyGoodsEvent({ order_id_global: "95RZ48EC", action_type: "chargeback" })).toBe("chargebacks");
  });

  it("routes a chargeback alert (forced pre-dispute refund) to chargebacks, not refunds", () => {
    expect(classifyBuyGoodsEvent({ order_id_global: "95RZ48EC", action_type: "chargeback_alert" })).toBe(
      "chargebacks"
    );
    expect(
      classifyBuyGoodsEvent({ order_id_global: "95RZ48EC", type: "Chargeback Alert-RDR" })
    ).toBe("chargebacks");
  });

  it("also detects a chargeback/dispute via the event query tag when action_type is absent", () => {
    expect(classifyBuyGoodsEvent({ order_id_global: "95RZ48EC" }, "dispute")).toBe("chargebacks");
  });

  it("skips a test ping with no order_id_global", () => {
    expect(classifyBuyGoodsEvent({ action_type: "sale" })).toBeNull();
    expect(classifyBuyGoodsEvent({ order_id_global: "" })).toBeNull();
  });

  it("skips n8n's own TSTFWD* workflow test ids, even ones shaped like a refund/chargeback", () => {
    expect(classifyBuyGoodsEvent({ order_id_global: "TSTFWD12345", action_type: "sale" })).toBeNull();
    expect(classifyBuyGoodsEvent({ order_id_global: "tstfwd-lowercase", action_type: "chargeback" })).toBeNull();
  });

  it("classifies a JSON-shaped n8n relay body the same as a form-encoded one", () => {
    // parseIpnParams coerces JSON values to strings before classify ever sees them.
    const p = { order_id_global: "983Z8053", action_type: "refund", total_amount_charged: "213.21" };
    expect(classifyBuyGoodsEvent(p)).toBe("refunds");
  });
});

describe("isN8nForwardEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to disabled outside production", () => {
    delete process.env.N8N_FORWARD_ENABLED;
    vi.stubEnv("NODE_ENV", "test");
    expect(isN8nForwardEnabled()).toBe(false);
  });

  it("defaults to enabled in production", () => {
    delete process.env.N8N_FORWARD_ENABLED;
    vi.stubEnv("NODE_ENV", "production");
    expect(isN8nForwardEnabled()).toBe(true);
  });

  it("an explicit false wins even in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("N8N_FORWARD_ENABLED", "false");
    expect(isN8nForwardEnabled()).toBe(false);
  });

  it("an explicit true wins even outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("N8N_FORWARD_ENABLED", "true");
    expect(isN8nForwardEnabled()).toBe(true);
  });
});

describe("forwardToN8n", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const meta = {
    receivedAt: "2026-09-04T12:00:00.000Z",
    eventTag: "sale",
    contentType: "application/x-www-form-urlencoded",
    method: "POST",
    rawBody: "order_id_global=95RZ48EC&action_type=sale",
  };

  it("does not call fetch when forwarding is disabled", async () => {
    vi.stubEnv("N8N_FORWARD_ENABLED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await forwardToN8n("orders", { order_id_global: "95RZ48EC" }, meta);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the right URL per target, with the default base URL", async () => {
    vi.stubEnv("N8N_FORWARD_ENABLED", "true");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await forwardToN8n("chargebacks", { order_id_global: "95RZ48EC" }, meta);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://n8n.neonature.online/webhook/buygoods-chargebacks");
  });

  it("respects a custom N8N_WEBHOOK_BASE_URL", async () => {
    vi.stubEnv("N8N_FORWARD_ENABLED", "true");
    vi.stubEnv("N8N_WEBHOOK_BASE_URL", "https://staging.example.com/hooks");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await forwardToN8n("refunds", { order_id_global: "95RZ48EC" }, meta);
    expect(fetchMock.mock.calls[0][0]).toBe("https://staging.example.com/hooks/buygoods-refunds");
  });

  it("sends JSON with the params object plus metadata, and application/json content type", async () => {
    vi.stubEnv("N8N_FORWARD_ENABLED", "true");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const params = { order_id_global: "95RZ48EC", action_type: "sale", customer_emailaddress: "a@b.com" };
    await forwardToN8n("orders", params, meta);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(init.body);
    expect(body.params).toEqual(params);
    expect(body.received_at).toBe(meta.receivedAt);
    expect(body.event).toBe(meta.eventTag);
    expect(body.content_type).toBe(meta.contentType);
    expect(body.method).toBe(meta.method);
    expect(body.raw_body).toBe(meta.rawBody);
  });

  it("swallows a non-2xx response instead of throwing", async () => {
    vi.stubEnv("N8N_FORWARD_ENABLED", "true");
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(forwardToN8n("orders", { order_id_global: "95RZ48EC" }, meta)).resolves.toBeUndefined();
  });

  it("swallows a network error instead of throwing", async () => {
    vi.stubEnv("N8N_FORWARD_ENABLED", "true");
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(forwardToN8n("orders", { order_id_global: "95RZ48EC" }, meta)).resolves.toBeUndefined();
  });
});
