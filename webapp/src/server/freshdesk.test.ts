import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildTicketListUrl,
  buildTicketPayload,
  createFreshdeskTicket,
  parseTicketList,
  parseTicketListWithRequester,
  listRecentFreshdeskTickets,
} from "./freshdesk";

describe("buildTicketPayload", () => {
  it("maps kind to Freshdesk priority and always opens the ticket", () => {
    expect(buildTicketPayload({ email: "a@b.com", subject: "Hi", kind: "support" }).priority).toBe(1);
    expect(buildTicketPayload({ email: "a@b.com", subject: "Hi", kind: "billing" }).priority).toBe(2);
    expect(buildTicketPayload({ email: "a@b.com", subject: "Hi", kind: "refund" }).priority).toBe(3);
    expect(buildTicketPayload({ email: "a@b.com", subject: "Hi", kind: "support" }).status).toBe(2);
  });

  it("tags every ticket for the app + its kind", () => {
    expect(buildTicketPayload({ email: "a@b.com", subject: "Hi", kind: "refund" }).tags).toEqual([
      "neonature-app",
      "refund",
    ]);
  });

  it("appends the order number to the description, skipping the placeholder dash", () => {
    const withOrder = buildTicketPayload({ email: "a@b.com", subject: "Late", description: "where is it", kind: "support", orderNumber: "NN-10482" });
    expect(withOrder.description).toContain("where is it");
    expect(withOrder.description).toContain("Order: NN-10482");

    const noOrder = buildTicketPayload({ email: "a@b.com", subject: "Late", description: "where is it", kind: "support", orderNumber: "—" });
    expect(noOrder.description).not.toContain("Order:");
  });

  it("sends every requester detail it has, so agents can reply, call and greet", () => {
    const full = buildTicketPayload({
      email: "jef@neonature.com.br",
      phone: "+5582988601037",
      name: "Jefte Nascimento",
      subject: "Hi",
      kind: "support",
    });
    expect(full.email).toBe("jef@neonature.com.br");
    expect(full.phone).toBe("+5582988601037");
    expect(full.name).toBe("Jefte Nascimento");
  });

  it("names a phone-only requester, which Freshdesk rejects without one", () => {
    const smsOnly = buildTicketPayload({ phone: "+5582988601037", subject: "Hi", kind: "support" });
    expect(smsOnly.name).toBe("Neo Nature customer");
    expect(smsOnly.email).toBeUndefined();

    // a real name always wins over the placeholder
    const named = buildTicketPayload({ phone: "+5582988601037", name: "Jefte", subject: "Hi", kind: "support" });
    expect(named.name).toBe("Jefte");
  });

  it("omits contact fields it doesn't have instead of sending blanks", () => {
    const emailOnly = buildTicketPayload({ email: "a@b.com", subject: "Hi", kind: "support" });
    expect(emailOnly.phone).toBeUndefined();
    expect(emailOnly.name).toBeUndefined();
  });

  it("falls back to the subject when no description is given", () => {
    expect(buildTicketPayload({ email: "a@b.com", subject: "Broken bottle", kind: "support" }).description).toBe(
      "Broken bottle"
    );
  });
});

describe("createFreshdeskTicket", () => {
  const input = { email: "jef@neonature.com.br", phone: "+5582988601037", subject: "Hi", kind: "support" } as const;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const configure = () => {
    vi.stubEnv("FRESHDESK_DOMAIN", "neonature");
    vi.stubEnv("FRESHDESK_API_KEY", "key");
  };
  const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body);

  it("drops the phone and retries when Freshdesk rejects it as another contact's", async () => {
    configure();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 400, ok: false, text: async () => "phone already in use" })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ id: 42 }) });
    vi.stubGlobal("fetch", fetchMock);

    expect(await createFreshdeskTicket(input)).toEqual({ ok: true, freshdeskId: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock.mock.calls[0]).phone).toBe("+5582988601037");
    // the retry keeps the email — that alone still identifies the customer
    expect(bodyOf(fetchMock.mock.calls[1]).phone).toBeUndefined();
    expect(bodyOf(fetchMock.mock.calls[1]).email).toBe("jef@neonature.com.br");
  });

  it("does not retry a phone-only requester, having no other way to identify them", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue({ status: 400, ok: false, text: async () => "bad request" });
    vi.stubGlobal("fetch", fetchMock);

    expect(await createFreshdeskTicket({ ...input, email: undefined })).toEqual({
      ok: false,
      reason: "api_error",
      detail: "400",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends one request when Freshdesk accepts the first", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ id: 7 }) });
    vi.stubGlobal("fetch", fetchMock);

    expect(await createFreshdeskTicket(input)).toEqual({ ok: true, freshdeskId: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("buildTicketListUrl", () => {
  it("encodes the email and pins ordering/paging", () => {
    expect(buildTicketListUrl("beneonature", "a+b@x.com")).toBe(
      "https://beneonature.freshdesk.com/api/v2/tickets?email=a%2Bb%40x.com&order_by=updated_at&per_page=30"
    );
  });
});

describe("parseTicketList", () => {
  it("maps enums to labels and builds agent deep links", () => {
    const [t] = parseTicketList("beneonature", [
      { id: 7, subject: "Where is my order", status: 2, priority: 3, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-02T00:00:00Z" },
    ]);
    expect(t).toEqual({
      id: 7,
      subject: "Where is my order",
      status: "Open",
      priority: "High",
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-02T00:00:00Z",
      url: "https://beneonature.freshdesk.com/a/tickets/7",
    });
  });

  it("tolerates junk rows and non-array payloads", () => {
    expect(parseTicketList("d", { error: "nope" })).toEqual([]);
    expect(parseTicketList("d", [null, "x", { subject: "no id" }])).toEqual([]);
  });
});

describe("parseTicketListWithRequester", () => {
  it("reads requester name/email/phone when present", () => {
    const [t] = parseTicketListWithRequester("beneonature", [
      {
        id: 44194,
        subject: "Where is my order",
        status: 2,
        priority: 3,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-02T00:00:00Z",
        requester: { name: "Jane Doe", email: "jane@x.com", phone: "+15551234567" },
      },
    ]);
    expect(t.requester).toEqual({ name: "Jane Doe", email: "jane@x.com", phone: "+15551234567" });
  });

  it("falls back to requester.mobile when phone is absent", () => {
    const [t] = parseTicketListWithRequester("d", [
      { id: 1, subject: "s", status: 2, priority: 1, requester: { mobile: "+447713480000" } },
    ]);
    expect(t.requester.phone).toBe("+447713480000");
  });

  it("nulls out requester fields when there is no requester object", () => {
    const [t] = parseTicketListWithRequester("d", [{ id: 1, subject: "s", status: 2, priority: 1 }]);
    expect(t.requester).toEqual({ name: null, email: null, phone: null });
  });

  it("tolerates junk rows and non-array payloads", () => {
    expect(parseTicketListWithRequester("d", { error: "nope" })).toEqual([]);
    expect(parseTicketListWithRequester("d", [null, "x", { subject: "no id" }])).toEqual([]);
  });
});

describe("listRecentFreshdeskTickets", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const configure = () => {
    vi.stubEnv("FRESHDESK_DOMAIN", "neonature");
    vi.stubEnv("FRESHDESK_API_KEY", "key");
  };

  it("returns not_configured without hitting the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await listRecentFreshdeskTickets()).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops after one page when it comes back under 100 rows", async () => {
    configure();
    const rows = Array.from({ length: 3 }, (_, i) => ({ id: i + 1, subject: `t${i}`, status: 2, priority: 1 }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => rows });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listRecentFreshdeskTickets({ sinceDays: 90 });
    expect(result).toEqual({ ok: true, tickets: expect.any(Array) });
    if (result.ok) expect(result.tickets).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("include=requester");
    expect(url).toContain("order_by=updated_at");
    expect(url).toContain("per_page=100");
    expect(url).toContain("page=1");
  });

  it("paginates while a page comes back full, capped at 3 pages", async () => {
    configure();
    const fullPage = () => Array.from({ length: 100 }, (_, i) => ({ id: i + 1, subject: "t", status: 2, priority: 1 }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => fullPage() });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listRecentFreshdeskTickets();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    if (result.ok) expect(result.tickets).toHaveLength(300);
  });

  it("returns api_error on a failed request without throwing", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    vi.stubGlobal("fetch", fetchMock);
    expect(await listRecentFreshdeskTickets()).toEqual({ ok: false, reason: "api_error", detail: "500" });
  });

  it("returns api_error when fetch throws", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    expect(await listRecentFreshdeskTickets()).toEqual({ ok: false, reason: "api_error", detail: "network" });
  });
});
