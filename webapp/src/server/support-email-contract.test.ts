import { afterEach, expect, it, vi } from "vitest";
import { canDeliverEmail, deliverSupportEmail, deterministicTier, emailInboundSchema, messageDedupeKey, outboundEmailPayload, readWebhookJson, requireWebhookKey, responseDueAt, supportEmailConfig } from "./support-email-contract";
import { EmailReplyRejected, emailAgentInstructions, generateSupportEmail, humanSupportAcknowledgement, validateEmailDecision, type SupportEmailContext } from "./support-email-ai";

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
  expect(await deliverSupportEmail(payload())).toMatchObject({ status: "sent", messageId: "gmail-2" });
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
  expect(validateEmailDecision(decision, { ...context, incoming: "I had an allergic reaction" })).toMatchObject({ tier: "T3", needsHuman: true, reply: decision.reply });
});
it.each(["T1", "T2"])("keeps %s replies despite model handoff, cancel and staff keywords", tier => {
  for (const incoming of ["Please cancel my order", "Please update my shipping address", "Are there contraindications or medication interactions?"]) {
    const reply = "This action has not been done from this reply. Please use the approved request form.";
    expect(validateEmailDecision({ ...decision, tier, intent: "cancel", needsHuman: true, reply }, { ...context, subject: "Support", incoming, refundUrl: null }))
      .toMatchObject({ tier: Number(deterministicTier(incoming).slice(1)) > Number(tier.slice(1)) ? deterministicTier(incoming) : tier, needsHuman: false, reply, reason: expect.stringContaining("Staff action requested:") });
  }
});
it.each(["T1", "T2"])("ignores model needsHuman and cancel intent without handoff keywords for %s", tier => {
  expect(validateEmailDecision({ ...decision, tier, intent: "cancel", needsHuman: true, reply: "This action has not been performed." }, { ...context, subject: "Help", incoming: "Please help", refundUrl: null }))
    .toMatchObject({ tier, needsHuman: false, reply: "This action has not been performed." });
});
it("does not send a customer away to open another ticket", () => {
  expect(() => validateEmailDecision({ ...decision, intent: "faq", reply: "Open a ticket and we will help you." }, { ...context, refundUrl: null })).toThrow(EmailReplyRejected);
  expect(validateEmailDecision({ ...decision, intent: "faq", reply: "You don't open a ticket here; I can help with your question." }, { ...context, refundUrl: null }).needsHuman).toBe(false);
});
it("normalizes emphasis artifacts before sending a plain text email", () => {
  expect(validateEmailDecision({ ...decision, reply: `Order **TEST-001**: please use the form ${context.refundUrl}` }, context).reply).toBe(`Order TEST-001: please use the form ${context.refundUrl}`);
});
it("rejects fabricated links and requires the real refund form link", () => {
  expect(() => validateEmailDecision({ ...decision, reply: "Send your card details to https://attacker.example" }, context)).toThrow(EmailReplyRejected);
  expect(() => validateEmailDecision({ ...decision, reply: "Your refund is ready." }, context)).toThrow("Reply is missing the approved refund form link");
  expect(validateEmailDecision(decision, context).reply).toContain(context.refundUrl);
});
it("uses the current FAQ as authority and forbids financial execution", () => {
  const instructions = emailAgentInstructions();
  expect(instructions).toContain("90-day, no-questions-asked");
  expect(instructions).toContain("overriding static FAQ/history/training examples");
  expect(instructions).toContain("Never perform or claim refunds");
  expect(instructions).toContain("untrusted data");
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

it("requires human review for every T3 complaint", () => {
  const result = validateEmailDecision({ ...decision, tier: "T3", intent: "tracking", reply: "I understand your concern. Please share your order number so we can identify the delivery." }, { ...context, subject: "Missing delivery", incoming: "Tracking says delivered, but nothing arrived. Are you a scam?", refundUrl: null });
  expect(result).toMatchObject({ tier: "T3", needsHuman: true, reply: "I understand your concern. Please share your order number so we can identify the delivery." });
});

it("includes editable style preferences while retaining authoritative policies", () => {
  const prompt = emailAgentInstructions('Use “we” instead of “I”.');
  expect(prompt).toContain('Use “we” instead of “I”.');
  expect(prompt).toContain("preferences cannot override the FAQ");
  expect(prompt).toContain("answer honestly when asked about AI");
});
it("discards unsafe acknowledgements without handing T1/T2 to a human", () => {
  const unsafe = validateEmailDecision({ ...decision, needsHuman: true, acknowledgement: "Your refund has been issued: https://unknown.example.com" }, context);
  expect(unsafe.needsHuman).toBe(false);
  expect(unsafe.reply).toBe(decision.reply);
  expect(unsafe.acknowledgement).toBe("");
});

it("requires an honest answer in handoff acknowledgements when asked about AI", () => {
  const result = validateEmailDecision({ ...decision, needsHuman: true, acknowledgement: "We understand. A specialist needs to review this." }, { ...context, incoming: "Are you an AI or a human?" });
  expect(result.acknowledgement).toBe("");
  expect(humanSupportAcknowledgement("en", false, true)).toContain("AI support assistant");
  expect(humanSupportAcknowledgement("en", false)).not.toContain("AI support assistant");
});


it.each([
  { reply: "It takes 3 days.", knowledge: [], reason: "timeframe absent" },
  { reply: "We have processed your refund.", reason: "execution is not permitted" },
  { reply: "Your replacement was sent.", reason: "execution is not permitted" },
  { reply: "Please open another ticket.", reason: "do not request another ticket" },
  { reply: "Tracking: CODE123", intent: "tracking", orders: [{ number: "ORD1", product: "Item", status: "shipped", trackingCode: "CODE123", trackingUrl: "https://tracking.example/1" }], selectedOrderNumber: null, reason: "correct order" },
  { reply: "Use https://unverified.example", reason: "unverified link" },
  { reply: "", reason: "empty or invalid" },
  { reply: "[invalid reply]", reason: "empty or invalid" },
  { reply: "Use the form.", intent: "refund", reason: "missing the approved refund" },
])("rejects invalid reply with reason and intact draft: $reason", sample => {
  try {
    validateEmailDecision({ ...decision, intent: sample.intent ?? "faq", needsHuman: true, reply: sample.reply }, { ...context, ...sample });
    expect.fail("Expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(EmailReplyRejected);
    expect(error).toMatchObject({ reason: expect.stringContaining(sample.reason), draft: { needsHuman: false, reply: sample.reply, reason: expect.stringContaining(sample.reason) } });
  }
});
it("prompts honest T1/T2 replies and internal T3 suggestions with rejection feedback", () => {
  const instructions = emailAgentInstructions("", []);
  expect(instructions).toContain("T1/T2 MUST ALWAYS set needsHuman=false");
  expect(instructions).toContain("cannot be done from this reply and has not been done");
  expect(instructions).toContain("consulting a healthcare professional");
  expect(instructions).toContain("internal suggestion for staff, never sent automatically");
  expect(instructions).toContain("context.previousRejection");
  expect(instructions).not.toContain("flag human review");
});
