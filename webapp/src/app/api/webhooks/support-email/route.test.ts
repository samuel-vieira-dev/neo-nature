import { afterEach, expect, it, vi } from "vitest";

const { receive, humanEvent } = vi.hoisted(() => ({ receive: vi.fn(), humanEvent: vi.fn() }));
vi.mock("@/server/support-email", () => ({ receiveSupportEmail: receive, receiveFreshdeskEmailEvent: humanEvent }));
import { POST } from "./route";
import { POST as humanPOST } from "./freshdesk/route";

afterEach(() => { vi.unstubAllEnvs(); receive.mockReset(); humanEvent.mockReset(); });
const body = () => ({ schemaVersion: 1, event: "email.received", eventId: "event-1", mailboxId: "support@example.com", threadId: "thread-1", messageId: "gmail-1", from: { email: "internal@example.com" }, subject: "Hello", text: "Hello", receivedAt: new Date().toISOString() });
const request = (data: unknown, key = "test-key") => new Request("https://example.com/api/webhooks/support-email", { method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": key }, body: JSON.stringify(data) });

it("does not invoke persistence when the inbound key is missing or incorrect", async () => {
  vi.stubEnv("SUPPORT_EMAIL_INBOUND_API_KEY", "");
  expect((await POST(request(body()))).status).toBe(503);
  vi.stubEnv("SUPPORT_EMAIL_INBOUND_API_KEY", "test-key");
  expect((await POST(request(body(), "wrong-key"))).status).toBe(401);
  expect(receive).not.toHaveBeenCalled();
});
it("acknowledges persisted mail with 202 independently of generation or sending", async () => {
  vi.stubEnv("SUPPORT_EMAIL_INBOUND_API_KEY", "test-key");
  receive.mockResolvedValue({ accepted: true, deduped: false, conversationId: "conversation-1" });
  const response = await POST(request(body()));
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({ accepted: true, conversationId: "conversation-1" });
  expect(receive).toHaveBeenCalledTimes(1);
});
it("rejects invalid payloads before persistence", async () => {
  vi.stubEnv("SUPPORT_EMAIL_INBOUND_API_KEY", "test-key");
  expect((await POST(request({ ...body(), from: { email: "not-an-email" } }))).status).toBe(400);
  expect(receive).not.toHaveBeenCalled();
});
it("requires a distinct secret for human takeover events", async () => {
  vi.stubEnv("SUPPORT_EMAIL_INBOUND_API_KEY", "inbound-only");
  vi.stubEnv("SUPPORT_EMAIL_FRESHDESK_WEBHOOK_API_KEY", "human-key");
  const event = { schemaVersion: 1, event: "human.assigned", eventId: "human-event-1", freshdeskId: 12345, occurredAt: new Date().toISOString() };
  expect((await humanPOST(request(event, "inbound-only"))).status).toBe(401);
  humanEvent.mockResolvedValue({ accepted: true });
  expect((await humanPOST(request(event, "human-key"))).status).toBe(200);
  expect(humanEvent).toHaveBeenCalledTimes(1);
});
