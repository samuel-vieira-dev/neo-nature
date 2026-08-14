import { describe, it, expect, vi, afterEach } from "vitest";
import { forwardTargets, forwardBuyGoodsEvent } from "./forward";

const body = "order_id_global=95RZ48EC&account_id=11227&action_type=refund";
const params = Object.fromEntries(new URLSearchParams(body));

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.BUYGOODS_FORWARD_TARGETS;
});

describe("forwardTargets", () => {
  it("maps the five BuyGoods accounts by default", () => {
    expect(Object.keys(forwardTargets()).sort()).toEqual(["11020", "11227", "11308", "11829", "9938"]);
  });

  it("lets the env replace the map, and an empty value disable forwarding", () => {
    process.env.BUYGOODS_FORWARD_TARGETS = "11227=https://n8n.test/zen, 9938=https://n8n.test/nerve";
    expect(forwardTargets()).toEqual({ "11227": "https://n8n.test/zen", "9938": "https://n8n.test/nerve" });

    process.env.BUYGOODS_FORWARD_TARGETS = "";
    expect(forwardTargets()).toEqual({});
  });
});

describe("forwardBuyGoodsEvent", () => {
  it("POSTs the payload verbatim to the account's webhook", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.BUYGOODS_FORWARD_TARGETS = "11227=https://n8n.test/zen";

    const result = await forwardBuyGoodsEvent(params, body, "application/x-www-form-urlencoded");

    expect(result).toMatchObject({ ok: true, accountId: "11227", status: 200, attempts: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://n8n.test/zen");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
  });

  it("re-encodes the params when the hit carried no body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.BUYGOODS_FORWARD_TARGETS = "11227=https://n8n.test/zen";

    await forwardBuyGoodsEvent(params, "", null);

    const init = fetchMock.mock.calls[0][1];
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual(params);
    expect(init.headers["content-type"]).toBe("application/x-www-form-urlencoded");
  });

  it("retries on failure and reports the last error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);
    process.env.BUYGOODS_FORWARD_TARGETS = "11227=https://n8n.test/zen";

    const result = await forwardBuyGoodsEvent(params, body, null);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ ok: false, reason: "failed", error: "ECONNREFUSED", attempts: 3 });
  });

  it("skips accounts with no mapped webhook, and payloads with no account_id", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.BUYGOODS_FORWARD_TARGETS = "11227=https://n8n.test/zen";

    expect(await forwardBuyGoodsEvent({ ...params, account_id: "999" }, body, null)).toEqual({
      ok: false,
      reason: "no-target",
      accountId: "999",
    });
    expect(await forwardBuyGoodsEvent({ order_id_global: "X" }, body, null)).toEqual({
      ok: false,
      reason: "no-account-id",
      accountId: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
