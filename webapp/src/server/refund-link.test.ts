import { describe, expect, it, vi } from "vitest";
import { createRefundEmailUrl, createRefundLinkToken, verifyRefundLinkToken } from "./refund-link";

describe("refund email links", () => {
  it("signs the internal order id and rejects tampering", async () => {
    vi.stubEnv("SESSION_SECRET", "test-secret");
    const token = await createRefundLinkToken("bg-95RZ48EC");
    expect(await verifyRefundLinkToken(token)).toBe("bg-95RZ48EC");
    expect(await verifyRefundLinkToken(`${token}x`)).toBeNull();
    vi.unstubAllEnvs();
  });

  it("builds a URL that can be inserted directly into an email template", async () => {
    const url = new URL(await createRefundEmailUrl("bg-95RZ48EC", "https://app.example.com/"));
    expect(`${url.origin}${url.pathname}`).toBe("https://app.example.com/refund/access");
    expect(url.searchParams.get("token")).toBeTruthy();
  });
});
