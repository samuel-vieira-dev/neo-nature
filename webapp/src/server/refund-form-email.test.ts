import { afterEach, describe, expect, it, vi } from "vitest";
import { refundFormEmailPayload, refundFormPath, sendRefundFormEmail } from "./refund-form-email";

const input = { requestId: "request-123", orderId: "bg-order &other=1", orderNumber: "42", customerName: "Test Customer", email: "test@example.com", refundPath: refundFormPath("bg-order &other=1") };

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("refund form email", () => {
  it("encodes the exact order identity without allowing additional URL parameters", () => {
    const url = new URL(refundFormPath(input.orderId), "https://app.beneonature.com");
    expect(url.pathname).toBe("/refund");
    expect([...url.searchParams]).toEqual([["order_id", "bg-order &other=1"]]);
    const payload = refundFormEmailPayload(input);
    expect(Object.keys(payload)).toEqual(["requestId", "to", "subject", "html", "text"]);
    expect(payload.to).toBe(input.email);
    expect(payload.html).toContain(url.toString().replaceAll("&", "&amp;"));
    expect(payload.text).toContain(url.toString());
  });
  it("escapes customer-supplied text in HTML", () => {
    const payload = refundFormEmailPayload({ ...input, customerName: "<Sam>", orderNumber: "<42>" });
    expect(payload.html).toContain("&lt;Sam&gt;");
    expect(payload.html).toContain("&lt;42&gt;");
    expect(payload.html).not.toContain("<Sam>");
  });
  it("does not claim delivery without a configured key", async () => {
    vi.stubEnv("REFUND_EMAIL_WEBHOOK_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await sendRefundFormEmail(input)).toEqual({ status: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends the contract and reports success only after matching provider confirmation", async () => {
    vi.stubEnv("REFUND_EMAIL_WEBHOOK_API_KEY", "test-secret");
    const fetch = vi.fn().mockResolvedValue(Response.json({ requestId: input.requestId, success: true, messageId: "gmail-1" }));
    vi.stubGlobal("fetch", fetch);
    expect(await sendRefundFormEmail(input)).toEqual({ status: "sent", messageId: "gmail-1" });
    expect(fetch).toHaveBeenCalledWith("https://n8n.neonature.online/webhook/enviar-form-cliente", expect.objectContaining({
      method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": "test-secret" }, body: JSON.stringify(refundFormEmailPayload(input)),
    }));
  });
  it.each([
    Response.json({ requestId: "other", success: true, messageId: "gmail-1" }),
    Response.json({ requestId: input.requestId, success: false, messageId: "gmail-1" }),
    new Response("forbidden", { status: 403 }),
  ])("rejects unconfirmed or unsuccessful webhook responses", async (response) => {
    vi.stubEnv("REFUND_EMAIL_WEBHOOK_API_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendRefundFormEmail(input)).toEqual({ status: "failed" });
  });
});
