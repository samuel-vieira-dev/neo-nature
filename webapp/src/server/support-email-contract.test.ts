import { afterEach, expect, it, vi } from "vitest";
import { canDeliverEmail, deliverSupportEmail, deterministicTier, emailInboundSchema, messageDedupeKey, outboundEmailPayload, readWebhookJson, requireWebhookKey, responseDueAt, supportEmailConfig } from "./support-email-contract";
import { emailAgentInstructions, generateSupportEmail, validateEmailDecision, type SupportEmailContext } from "./support-email-ai";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const payload = () => outboundEmailPayload({ requestId: "request-1", conversationId: "conversation-1", mailboxId: "support@example.com", threadId: "thread-1", messageId: "gmail-1", rfcMessageId: "<rfc-1@example.com>", references: ["<rfc-0@example.com>"], email: "internal@example.com", subject: "Refund", text: "Hello <script>alert(1)</script>" });
const context: SupportEmailContext = { history: [], subject: "Refund", incoming: "Please refund my order", hasAttachments: false, orders: [], refundUrl: "https://app.beneonature.com/refund?order_id=test" };
const decision = { tier: "T2", language: "en", intent: "refund", needsHuman: false, reason: "", reply: `Please complete the form: ${context.refundUrl}` };

it("requires an independently configured secret without cookie authentication", () => {
  const request = new Request("https://example.com", { headers: { "X-API-Key": "correct" } });
  expect(() => requireWebhookKey(request, "correct")).not.toThrow();
  try { requireWebhookKey(request, undefined); } catch (e) { expect((e as Response).status).toBe(503); }
  try { requireWebhookKey(request, "wrong"); } catch (e) { expect((e as Response).status).toBe(401); }
});
it("bounds streamed payloads before JSON parsing", async () => {
  await expect(readWebhookJson(new Request("https://example.com", { method: "POST", body: "x".repeat(256001) }))).rejects.toHaveProperty("status", 413);
});
it("separates provider IDs and RFC headers, rejecting header injection", () => {
  expect(emailInboundSchema.safeParse({ schemaVersion: 1, event: "email.received", eventId: "event-1", mailboxId: "support@example.com", threadId: "thread-1", messageId: "gmail-1", from: { email: "internal@example.com" }, subject: "Hello\r\nBcc: stranger@example.com", text: "Hello", receivedAt: new Date().toISOString() }).success).toBe(false);
  expect(messageDedupeKey("SUPPORT@example.com", "same-id")).toBe(messageDedupeKey("support@example.com", "same-id"));
  expect(messageDedupeKey("other@example.com", "same-id")).not.toBe(messageDedupeKey("support@example.com", "same-id"));
});
it("keeps delivery off by default and limits pilot delivery to exact internal addresses", () => {
  vi.stubEnv("SUPPORT_EMAIL_MODE", "draft");
  expect(canDeliverEmail("internal@example.com")).toBe(false);
  vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot");
  vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS", "internal@example.com");
  expect(canDeliverEmail("INTERNAL@example.com")).toBe(true);
  expect(canDeliverEmail("other@example.com")).toBe(false);
  vi.stubEnv("SUPPORT_EMAIL_MODE", "unexpected");
  expect(canDeliverEmail("internal@example.com")).toBe(false);
});
it("preserves reply threading and escapes untrusted content in HTML", () => {
  const result = payload();
  expect(result.inReplyTo).toBe("<rfc-1@example.com>");
  expect(result.references).toEqual(["<rfc-0@example.com>", "<rfc-1@example.com>"]);
  expect(result.html).not.toContain("<script>");
  expect(result.to).toBe("internal@example.com");
});
it("requires confirmed Gmail acceptance and suspends uncertain sends", async () => {
  vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot"); vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS", "internal@example.com");
  vi.stubEnv("SUPPORT_EMAIL_OUTBOUND_WEBHOOK_URL", "https://n8n.example.com/send"); vi.stubEnv("SUPPORT_EMAIL_OUTBOUND_API_KEY", "test-key");
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ success: true, requestId: "wrong", messageId: "gmail-2" })).mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(Response.json({ success: false, sent: false, requestId: "request-1" }, { status: 503 })).mockResolvedValueOnce(Response.json({ success: true, requestId: "request-1", messageId: "gmail-2" }));
  vi.stubGlobal("fetch", fetchMock);
  expect((await deliverSupportEmail(payload())).status).toBe("unknown");
  expect((await deliverSupportEmail(payload())).status).toBe("unknown");
  expect((await deliverSupportEmail(payload())).status).toBe("failed");
  expect(await deliverSupportEmail(payload())).toEqual({ status: "sent", messageId: "gmail-2" });
  expect(new Set(fetchMock.mock.calls.map(c => JSON.parse(c[1].body).requestId)).size).toBe(1);
});
it("never sends to a recipient outside the pilot allowlist", async () => {
  vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot"); vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS", "someone-else@example.com");
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  expect((await deliverSupportEmail(payload())).status).toBe("blocked");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("applies the delay range and cannot configure an instant reply", () => {
  vi.stubEnv("SUPPORT_EMAIL_MIN_DELAY_MINUTES", "15"); vi.stubEnv("SUPPORT_EMAIL_MAX_DELAY_MINUTES", "45");
  const now = new Date("2026-10-05T12:00:00Z");
  expect(responseDueAt(now, 0).getTime() - now.getTime()).toBe(15 * 60_000);
  expect(responseDueAt(now, 1).getTime() - now.getTime()).toBe(45 * 60_000);
  vi.stubEnv("SUPPORT_EMAIL_MIN_DELAY_MINUTES", "0");
  expect(supportEmailConfig().minDelay).toBe(1);
});
it("never lets model output downgrade critical cases", () => {
  expect(deterministicTier("I had an allergic reaction")).toBe("T3");
  expect(validateEmailDecision(decision, { ...context, incoming: "I had an allergic reaction" })).toMatchObject({ tier: "T3", needsHuman: true, reply: "" });
});
it("hands cancellation requests to staff even when the model proposes a reply", () => {
  expect(validateEmailDecision({ ...decision, tier: "T2", intent: "cancel", needsHuman: false, reply: "Open another ticket and we will cancel it in 48 hours." }, { ...context, incoming: "Please cancel my order", refundUrl: null })).toMatchObject({ tier: "T3", needsHuman: true, reply: "", reason: "Cancellation requires a staff member to perform the action" });
});
it("does not send a customer away to open another ticket", () => {
  expect(validateEmailDecision({ ...decision, intent: "faq", reply: "Open a ticket and we will help you." }, { ...context, refundUrl: null })).toMatchObject({ tier: "T3", needsHuman: true, reply: "" });
  expect(validateEmailDecision({ ...decision, intent: "faq", reply: "You don't open a ticket here; I can help with your question." }, { ...context, refundUrl: null }).needsHuman).toBe(false);
});
it("normalizes emphasis artifacts before sending a plain text email", () => {
  expect(validateEmailDecision({ ...decision, reply: `Order **TEST-001**: please use the form ${context.refundUrl}` }, context).reply).toBe(`Order TEST-001: please use the form ${context.refundUrl}`);
});
it("rejects fabricated links and requires the real refund form link", () => {
  expect(validateEmailDecision({ ...decision, reply: "Send your card details to https://attacker.example" }, context)).toMatchObject({ needsHuman: true });
  expect(() => validateEmailDecision({ ...decision, reply: "Your refund is ready." }, context)).toThrow("refund_form_link_missing");
  expect(validateEmailDecision(decision, context).reply).toContain(context.refundUrl);
});
it("uses the current FAQ as authority and forbids financial execution", () => {
  const instructions = emailAgentInstructions();
  expect(instructions).toContain("90-day, no-questions-asked");
  expect(instructions).toContain("overrides any contrary historical message");
  expect(instructions).toContain("cannot execute refunds");
  expect(instructions).toContain("UNTRUSTED DATA");
});

it("supports OpenAI Responses with server-side credentials and validates a multilingual reply", async () => {
  vi.stubEnv("SUPPORT_EMAIL_LLM_PROVIDER", "openai"); vi.stubEnv("SUPPORT_EMAIL_MODEL", "test-model"); vi.stubEnv("OPENAI_API_KEY", "test-key");
  const french = { tier: "T1", language: "fr", intent: "faq", needsHuman: false, reason: "", reply: "Bonjour ! Merci de nous avoir contactés." };
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(french) }] }] }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await generateSupportEmail({ ...context, subject: "Bonjour", incoming: "Bonjour", refundUrl: null })).toEqual(french);
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: "test-model", store: false });
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-key");
});
