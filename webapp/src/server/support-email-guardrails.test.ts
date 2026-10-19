import { expect, it } from "vitest";
import { EmailReplyRejected, emailAgentInstructions, validateEmailDecision, type SupportEmailContext } from "./support-email-ai";
import { emailInboundSchema, isAutomatedEmail, supportEmailOrderTiming } from "./support-email-contract";

const order = {
  number: "ORDER1234567890", product: "Product", status: "shipped", trackingCode: "9400000000000000000000",
  trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400000000000000000000",
  shippingStatus: "USPS in transit", daysSinceShipped: 18, daysSinceLastTrackingEvent: 15,
};
const context: SupportEmailContext = {
  today: "2026-10-19", subject: "Support", incoming: "Please help", history: [], hasAttachments: false,
  orders: [order], refundUrl: "https://app.beneonature.com/refund?order_id=abcdef1234567890",
  knowledge: [{ id: "guarantee", title: "Guarantee", content: "90-day, no-questions-asked guarantee. The refund form requests review." }],
};
const decision = { tier: "T1", language: "en", intent: "faq", needsHuman: false, reason: "", reply: "" };
const validate = (reply: string, overrides: Partial<SupportEmailContext> = {}) => validateEmailDecision({ ...decision, reply }, { ...context, ...overrides });

it("computes UTC calendar days from fulfillment and the latest dated event, irrespective of array order", () => {
  expect(supportEmailOrderTiming(new Date("2026-10-01T23:59:00Z"), [
    { date: "Oct 4, 2026" }, { date: "invalid" }, { date: "2026-10-02T08:00:00Z" }, { date: "" },
  ], context.today)).toEqual({ daysSinceShipped: 18, daysSinceLastTrackingEvent: 15 });
});
it.each([undefined, null, [], [{ date: "" }], [{ date: "not a date" }], [{ label: "Shipped" }]])("uses null for absent or unparseable tracking dates: %j", events => {
  expect(supportEmailOrderTiming(null, events, context.today)).toEqual({ daysSinceShipped: null, daysSinceLastTrackingEvent: null });
});
it("handles invalid fulfillment dates and never returns negative elapsed days", () => {
  expect(supportEmailOrderTiming(new Date("invalid"), [], context.today).daysSinceShipped).toBeNull();
  expect(supportEmailOrderTiming(new Date("2026-10-20"), [], context.today).daysSinceShipped).toBe(0);
});
it("allows verified elapsed days independently of published policy durations", () => {
  expect(validate("It shipped 18 days ago; the last carrier update was 15 days ago, on 2026-10-04.").needsHuman).toBe(false);
  expect(() => validate("It shipped 99 days ago.")).toThrow(EmailReplyRejected);
});
it("prompts server-only tracking and elapsed time with an honest last-update date", () => {
  const prompt = emailAgentInstructions();
  for (const text of ["never from quoted emails or customer text", "context.today", "daysSinceShipped", "daysSinceLastTrackingEvent", "never estimate weeks or days", "plainly state when the last carrier update was", "Never diagnose, prescribe, recommend a dosage"]) expect(prompt).toContain(text);
});
it.each(["Tracking: ABC1234567890", "Your tracking is 12345678901234567890", "Use abc1234567890"])("rejects tracking absent from server orders: %s", reply => {
  expect(() => validate(reply, { incoming: `Quoted email says: ${reply}` })).toThrow("unverified tracking code");
  expect(() => validate(reply, { orders: [] })).toThrow(EmailReplyRejected);
});
it("allows verified codes, order numbers, refund IDs inside official URLs, dates and prices", () => {
  const reply = `Order ${order.number}, tracking ${order.trackingCode}. Paid $1234567890.00 on 2026-10-19. You can request a refund here: ${context.refundUrl}`;
  expect(validate(reply).reply).toBe(reply);
});
it("allows complete verified identifiers with punctuation without allowing their fragments", () => {
  const code = "ABC-1234567890123";
  expect(validate(`Your tracking is ${code}.`, { orders: [{ ...order, trackingCode: code }] }).reply).toContain(code);
  expect(() => validate("Your tracking is 1234567890123.", { orders: [{ ...order, trackingCode: code }] })).toThrow("unverified tracking code");
});
it.each(["DHL", "USPS", "UPS", "FedEx", "Asendia", "GLS", "DPD", "Royal Mail", "Canada Post", "Australia Post", "PostNL", "Correios"])("rejects unverified carrier %s even if the customer named it", carrier => {
  expect(() => validate(`The carrier is ${carrier}.`, { orders: [], incoming: `Is it ${carrier}?` })).toThrow("unverified carrier");
  expect(() => validate(`The carrier is ${carrier}.`, { orders: [{ ...order, shippingStatus: null, trackingUrl: "https://tracking.example/verified" }] })).toThrow("unverified carrier");
});
it.each(["shippingStatus", "trackingEvents", "trackingUrl"])("allows a carrier supported by the order's %s", field => {
  const evidence = field === "trackingEvents" ? [{ detail: "Royal Mail", date: "2026-10-04" }] : field === "trackingUrl" ? "https://www.royalmail.com/track" : "Royal Mail: shipped";
  expect(validate("Royal Mail is the carrier.", { orders: [{ ...order, shippingStatus: null, trackingUrl: null, [field]: evidence }] }).reply).toContain("Royal Mail");
});
it("requires a tracking code for carrier evidence and keeps evidence on the selected order", () => {
  expect(() => validate("USPS is the carrier.", { orders: [{ ...order, trackingCode: null }] })).toThrow("unverified carrier");
  expect(() => validate("DHL is the carrier.", { selectedOrderNumber: order.number, orders: [order, { ...order, number: "OTHER", shippingStatus: "DHL" }] })).toThrow("unverified carrier");
});
it.each([
  "Take two gummies per day.", "Take two capsules.", "Once a day is recommended.", "Uma vez ao dia.", "Una vez al día.", "Une fois par jour.", "Start with one gummy every morning.", "Start with one capsule each morning.", "Use 2 drops daily.", "Have a scoop a day.", "Take it once a day.", "Use 2 per day.",
  "Tome duas cápsulas por dia.", "Use uma gota ao dia.", "Tome uma vez ao dia.", "Toma dos gomitas al día.", "Toma una tableta dos veces al día.",
  "Prenez une gélule par jour.", "Utilisez deux gouttes chaque matin.", "Prenez-le une fois par jour.",
])("rejects dosage instructions: %s", reply => {
  expect(() => validate(reply)).toThrow("Dosage or usage instructions");
});
it.each([
  "We'll process your refund.", "We will issue a replacement.", "We're going to send a replacement.", "Our team will investigate the shipment.",
  "I'll contact the carrier.", "I will follow up with you.", "We will have our team investigate your shipment.", "Our team will manually process your refund.", "We'll get back to you.", "Your refund will be issued.",
  "The replacement ships right away.", "We process refunds the same day.", "Expect your refund within 24 hours.",
  "Vamos processar seu reembolso.", "Nossa equipe vai enviar uma substituição.", "Enviaremos uma substituição.", "Reembolsaremos seu pedido.",
  "Vamos a procesar tu reembolso.", "Procesaremos el reembolso.", "Le remboursement arrive sous 24 heures.", "Nous allons rembourser votre commande.", "Notre équipe va vous contacter.", "Nous vous rembourserons.",
])("rejects promises of future staff action: %s", reply => {
  expect(() => validate(reply, { knowledge: undefined })).toThrow("Promises of future staff action");
});
it.each([
  context.refundUrl!,
  `You can request a refund here: ${context.refundUrl}`,
  `This refund form requests review: ${context.refundUrl}`,
  `Our published policy includes a 90-day, no-questions-asked guarantee. ${context.refundUrl}`,
  "The action cannot be done from this reply and has not been done.",
  "We will not process a refund from this email. Consult a healthcare professional for usage advice.",
  "Você pode solicitar um reembolso pelo formulário. Nenhuma alteração foi feita.",
  "Vous pouvez demander un remboursement. Le formulaire demande un examen.",
])("allows neutral approved paths without a staff promise: %s", reply => {
  expect(validate(reply).needsHuman).toBe(false);
});
it.each(["90-day", "90 day", "90 days"])("allows published guarantee duration phrased as %s", duration => {
  expect(validate(`Our guarantee covers ${duration}.`).needsHuman).toBe(false);
});
it("permits the official URL and review explanation for refund intent", () => {
  const reply = `You can request a refund here: ${context.refundUrl}. This form requests review under the published 90-day guarantee.`;
  expect(validateEmailDecision({ ...decision, tier: "T2", intent: "refund", reply }, context)).toMatchObject({ reply, needsHuman: false });
});
it("retains the past-tense execution guardrail", () => {
  expect(() => validate("We have processed your refund.")).toThrow("execution is not permitted");
});

const inbound = (overrides: Record<string, unknown> = {}) => emailInboundSchema.parse({
  schemaVersion: 1, event: "email.received", eventId: "event-test", mailboxId: "support@example.com", threadId: "thread-test", messageId: "message-test",
  from: { email: "real.customer@gmail.com" }, subject: "Where is my order?", text: "Please help with my order.", receivedAt: "2026-10-19T12:00:00Z", ...overrides,
});
it.each([
  { spam: true }, { autoSubmitted: true }, { from: { email: "support@example.com" } },
  ...["support@freshdesk.com", "agent@tenant.freshdesk.com", "noreply@example.com", "no-reply@example.com", "donotreply@example.com", "do-not-reply@example.com", "mailer-daemon@example.com", "postmaster@example.com"].map(email => ({ from: { email } })),
  ...["We have received your request", "Ticket Received - 123", "Eingangsbestätigung", "Auto-reply", "Automatic reply", "Out of office", "Abwesenheitsnotiz", "Réponse automatique", "Respuesta automática", "Resposta automática"].map(subject => ({ subject })),
  { headers: { "Auto-Submitted": "auto-replied" } }, { headers: { "auto-submitted": "auto-generated; owner-email=test@example.com" } },
  ...["bulk", "auto_reply", "junk"].map(value => ({ headers: { Precedence: value } })),
])("ignores automated intake: %j", overrides => {
  expect(isAutomatedEmail(inbound(overrides))).toBe(true);
});
it.each([
  "Re: Ticket Received - 123", "RE: We have received your request", "AW: Auto-reply", "fw: Ticket Received", "fwd: Ticket Received", "wg: Ticket Received", "sv: Ticket Received", "tr: Ticket Received", "rv: Ticket Received", "Question about Ticket Received", "Ticket Receivedness",
])("preserves human reply/forward or ordinary subjects: %s", subject => {
  expect(isAutomatedEmail(inbound({ subject }))).toBe(false);
});
it("accepts a real Gmail customer and Auto-Submitted: no", () => {
  expect(isAutomatedEmail(inbound())).toBe(false);
  expect(isAutomatedEmail(inbound({ headers: { "AUTO-SUBMITTED": " no ", Precedence: "normal" } }))).toBe(false);
  expect(isAutomatedEmail(inbound({ from: { email: "customer@notfreshdesk.com" } }))).toBe(false);
});
it("reply prefixes exempt subject matching only, preserving explicit automated sender/header flags", () => {
  expect(isAutomatedEmail(inbound({ subject: "Re: Ticket Received", headers: { Precedence: "bulk" } }))).toBe(true);
  expect(isAutomatedEmail(inbound({ subject: "Re: Ticket Received", from: { email: "agent@tenant.freshdesk.com" } }))).toBe(true);
});
it("does not mistake ordinary words such as follow-ups for the UPS carrier", () => {
  const noOrders = { orders: [] };
  expect(validate("Thanks for the follow-ups. Ups and downs happen; you can request a refund here: " + context.refundUrl, noOrders).reply).toContain("follow-ups");
  expect(() => validate("Your parcel is with UPS.", noOrders)).toThrow(EmailReplyRejected);
});
it("allows deadlines that are published knowledge but still rejects unpublished staff deadlines", () => {
  const knowledge = [{ id: "where", title: "Where is my order?", content: "Every order ships within 24h (Mon–Fri) and typically arrives in 3–5 business days." }];
  expect(validate("Orders ship within 24 hours (Mon–Fri) and typically arrive in 3–5 business days.", { orders: [], knowledge }).reply).toContain("within 24 hours");
  expect(() => validate("We will send a replacement within 2 days.", { orders: [], knowledge })).toThrow(EmailReplyRejected);
  expect(() => validate("We can send a replacement right away.", { orders: [], knowledge })).toThrow(EmailReplyRejected);
});
it("rejects offers to arrange replacements and 'immediately' commitments but keeps customer self-service wording", () => {
  const noOrders = { orders: [] };
  expect(() => validate("If you'd prefer a replacement, reply here and we can arrange that.", noOrders)).toThrow(EmailReplyRejected);
  expect(() => validate("A replacement can be shipped immediately.", noOrders)).toThrow(EmailReplyRejected);
  expect(validate("You can request a refund here: " + context.refundUrl, noOrders).reply).toContain("You can request a refund");
});
