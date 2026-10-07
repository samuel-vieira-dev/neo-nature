import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const identifier = z.string().trim().min(1).max(256).regex(/^[^\r\n]+$/);
const rfcId = z.string().trim().max(998).regex(/^<[^<>\r\n]+>$/);
export const emailInboundSchema = z.object({
  schemaVersion: z.literal(1),
  event: z.literal("email.received"),
  eventId: identifier,
  mailboxId: z.email().transform(s => s.toLowerCase()),
  threadId: identifier,
  messageId: identifier, // Gmail/provider ID, distinct from the RFC Message-ID header
  rfcMessageId: rfcId.optional(),
  references: z.array(rfcId).max(50).default([]),
  from: z.object({ email: z.email().transform(s => s.toLowerCase()), name: z.string().max(200).default("") }),
  subject: z.string().max(500).regex(/^[^\r\n]*$/),
  text: z.string().trim().min(1).max(32_000),
  receivedAt: z.iso.datetime({ offset: true }),
  attachments: z.array(z.object({ id: identifier, name: z.string().max(250), contentType: z.string().max(150) })).max(20).default([]),
  autoSubmitted: z.boolean().default(false),
  spam: z.boolean().default(false),
});
export type EmailInbound = z.infer<typeof emailInboundSchema>;
export const freshdeskEmailEventSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: identifier,
  event: z.enum(["human.assigned", "human.replied", "ticket.resolved", "ticket.reopened"]),
  conversationId: z.uuid().optional(),
  freshdeskId: z.number().int().positive(),
  messageId: identifier.optional(),
  text: z.string().max(32_000).optional(),
  occurredAt: z.iso.datetime({ offset: true }),
}).refine(s => s.event !== "human.replied" || !!(s.messageId && s.text), { message: "human.replied requires messageId and text" });

export function requireWebhookKey(request: Request, configured: string | undefined) {
  if (!configured?.trim()) throw Response.json({ error: "integration_not_configured" }, { status: 503 });
  const expected = Buffer.from(configured.trim());
  const actual = Buffer.from(request.headers.get("x-api-key") ?? "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function readWebhookJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Response.json({ error: "invalid_request" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 256_000) {
      await reader.cancel();
      throw Response.json({ error: "payload_too_large" }, { status: 413 });
    }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Response.json({ error: "invalid_json" }, { status: 400 }); }
}

export const messageDedupeKey = (mailbox: string, messageId: string) =>
  createHash("sha256").update(`${mailbox.toLowerCase()}\n${messageId}`).digest("hex");

export function supportEmailConfig() {
  const modeValue = process.env.SUPPORT_EMAIL_MODE ?? "draft";
  const mode = ["off", "draft", "pilot", "live"].includes(modeValue) ? modeValue : "off";
  const number = (value: string | undefined, fallback: number, max: number) => {
    const n = value?.trim() ? Number(value) : fallback;
    return Number.isFinite(n) ? Math.min(max, Math.max(1, Math.round(n))) : fallback;
  };
  const minDelay = number(process.env.SUPPORT_EMAIL_MIN_DELAY_MINUTES, 15, 1440);
  return {
    mode,
    provider: process.env.SUPPORT_EMAIL_LLM_PROVIDER ?? "anthropic",
    model: process.env.SUPPORT_EMAIL_MODEL || (process.env.SUPPORT_EMAIL_LLM_PROVIDER === "openai" ? "" : process.env.FAQ_AI_MODEL || "claude-haiku-4-5-20251001"),
    minDelay,
    maxDelay: Math.max(minDelay, number(process.env.SUPPORT_EMAIL_MAX_DELAY_MINUTES, 45, 1440)),
    allowedRecipients: (process.env.SUPPORT_EMAIL_ALLOWED_RECIPIENTS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
    signature: process.env.SUPPORT_EMAIL_SIGNATURE?.trim() || "Neo Nature Support",
  };
}

export function canDeliverEmail(email: string) {
  const config = supportEmailConfig();
  return config.mode === "live" || (config.mode === "pilot" && config.allowedRecipients.includes(email.toLowerCase()));
}

export function responseDueAt(now: Date, random = Math.random()) {
  const { minDelay, maxDelay } = supportEmailConfig();
  const minutes = minDelay + Math.min(1, Math.max(0, random)) * (maxDelay - minDelay);
  return new Date(now.getTime() + minutes * 60_000);
}

export function deterministicTier(text: string): "T1" | "T2" | "T3" {
  if (/chargeback|\bfraud|\bscam|\bBBB\b|better business bureau|lawsuit|attorney|allerg|side effects?|chest pain|difficulty breathing|hospital|reaction|reaç|reac[cç]i[oó]n|effets? secondaires|avocat|advogado|procon|unauthori[sz]ed|não autoriz|no autoriz/i.test(text)) return "T3";
  if (/refund|return|cancel|reembolso|devolu|rembours|annul|cobrança|overcharg|duplicate charge/i.test(text)) return "T2";
  return "T1";
}

export function escapeEmailHtml(text: string) {
  return text.replace(/[&<>"']/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[s]!);
}

function emailParagraph(text: string) {
  return text.split(/(https?:\/\/[^\s<>]+)/g).map(part => {
    if (!/^https?:\/\//.test(part)) return escapeEmailHtml(part).replace(/\n/g, "<br>");
    const url = part.replace(/[.,;!?)]+$/, "");
    return `<a href="${escapeEmailHtml(url)}">${escapeEmailHtml(url)}</a>${escapeEmailHtml(part.slice(url.length))}`;
  }).join("");
}

export function outboundEmailPayload(input: { requestId: string; conversationId: string; mailboxId: string; threadId: string; messageId: string; rfcMessageId: string | null; references: string[]; email: string; subject: string; text: string }) {
  return {
    schemaVersion: 1,
    event: "email.reply",
    requestId: input.requestId,
    conversationId: input.conversationId,
    mailboxId: input.mailboxId,
    threadId: input.threadId,
    inboundMessageId: input.messageId,
    to: input.email,
    subject: /^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`,
    text: input.text,
    html: input.text.split(/\n\s*\n/).map(p => `<p>${emailParagraph(p)}</p>`).join(""),
    inReplyTo: input.rfcMessageId,
    references: [...new Set([...input.references, ...(input.rfcMessageId ? [input.rfcMessageId] : [])])],
  };
}

export async function deliverSupportEmail(payload: ReturnType<typeof outboundEmailPayload>) {
  if (!canDeliverEmail(payload.to)) return { status: "blocked" as const, error: "delivery_disabled_for_recipient" };
  const url = process.env.SUPPORT_EMAIL_OUTBOUND_WEBHOOK_URL;
  const key = process.env.SUPPORT_EMAIL_OUTBOUND_API_KEY;
  if (!url || !key) return { status: "blocked" as const, error: "outbound_not_configured" };
  let target: URL;
  try { target = new URL(url); } catch { return { status: "blocked" as const, error: "invalid_outbound_url" }; }
  if (target.protocol !== "https:" || target.username || target.password) return { status: "blocked" as const, error: "invalid_outbound_url" };
  try {
    const res = await fetch(target, {
      method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": key },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000), redirect: "error", cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.success === true && body.requestId === payload.requestId && typeof body.messageId === "string" && body.messageId.trim()) {
      return { status: "sent" as const, messageId: body.messageId.trim() };
    }
    // n8n must explicitly guarantee that no Gmail send happened to make a retry safe.
    if (body?.requestId === payload.requestId && body.success === false && body.sent === false) {
      return { status: "failed" as const, error: "outbound_rejected_without_send" };
    }
    return { status: "unknown" as const, error: "outbound_confirmation_missing" };
  } catch { return { status: "unknown" as const, error: "outbound_delivery_uncertain" }; }
}
