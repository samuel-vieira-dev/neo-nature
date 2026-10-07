import { and, asc, count, desc, eq, ilike, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, supportEmailConversations as conversations, supportEmailMessages as messages, supportEmailJobs as jobs } from "@/db/schema";
import { buildTrackingUrl } from "@/lib/tracking";
import { refundFormPath } from "./refund-form-email";
import { generateSupportEmail, type SupportEmailContext } from "./support-email-ai";
import { canDeliverEmail, deliverSupportEmail, deterministicTier, messageDedupeKey, outboundEmailPayload, responseDueAt, supportEmailConfig, type EmailInbound, freshdeskEmailEventSchema } from "./support-email-contract";
import { pushEmailToFreshdesk } from "./support-email-freshdesk";
import type { z } from "zod";

type Conversation = typeof conversations.$inferSelect;
type Message = typeof messages.$inferSelect;
type Job = typeof jobs.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const lockKey = (c: Pick<Conversation, "mailboxId" | "threadId">) => `${c.mailboxId}\n${c.threadId}`;
const lock = (tx: Transaction, key: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);

export type EmailReceipt = { accepted: boolean; deduped?: boolean; ignored?: boolean; reason?: string; conversationId?: string; messageId?: string; tier?: string };
export async function receiveSupportEmail(input: EmailInbound): Promise<EmailReceipt> {
  const now = new Date();
  if (new Date(input.receivedAt).getTime() > now.getTime() + 5 * 60_000) throw Response.json({ error: "received_at_in_future" }, { status: 400 });
  if (input.spam || input.autoSubmitted || input.from.email === input.mailboxId) return { accepted: true, ignored: true, reason: "automated_spam_or_self_message" };
  const dedupeKey = messageDedupeKey(input.mailboxId, input.messageId);
  return db.transaction(async tx => {
    await lock(tx, lockKey(input));
    const existing = await tx.query.supportEmailMessages.findFirst({ where: eq(messages.dedupeKey, dedupeKey) });
    if (existing) {
      const c = await tx.query.supportEmailConversations.findFirst({ where: eq(conversations.id, existing.conversationId) });
      if (c?.email !== input.from.email || c.threadId !== input.threadId || existing.text !== input.text || existing.subject !== input.subject) throw Response.json({ error: "message_id_conflict" }, { status: 409 });
      return { accepted: true, deduped: true, conversationId: existing.conversationId, messageId: existing.id };
    }
    const tier = deterministicTier(`${input.subject}\n${input.text}`);
    await tx.insert(conversations).values({ id: crypto.randomUUID(), mailboxId: input.mailboxId, threadId: input.threadId, email: input.from.email, name: input.from.name, subject: input.subject, tier }).onConflictDoNothing({ target: [conversations.mailboxId, conversations.threadId] });
    const c = (await tx.query.supportEmailConversations.findFirst({ where: and(eq(conversations.mailboxId, input.mailboxId), eq(conversations.threadId, input.threadId)) }))!;
    if (c.email !== input.from.email) throw Response.json({ error: "thread_sender_mismatch" }, { status: 409 });
    const [m] = await tx.insert(messages).values({ id: crypto.randomUUID(), conversationId: c.id, dedupeKey, providerMessageId: input.messageId, rfcMessageId: input.rfcMessageId, direction: "incoming", subject: input.subject, text: input.text, references: input.references, attachments: input.attachments, receivedAt: new Date(input.receivedAt) }).returning();
    const previous = c.latestMessageId ? await tx.query.supportEmailMessages.findFirst({ where: eq(messages.id, c.latestMessageId) }) : null;
    if (previous && previous.receivedAt > m.receivedAt) return { accepted: true, ignored: true, reason: "older_message_saved", conversationId: c.id, messageId: m.id };
    await tx.update(jobs).set({ status: "cancelled", error: "new_customer_message" }).where(and(eq(jobs.conversationId, c.id), inArray(jobs.stage, ["prepare", "send"]), inArray(jobs.status, ["queued", "blocked", "review", "failed"])));
    const uncertain = await tx.query.supportEmailJobs.findFirst({ where: and(eq(jobs.conversationId, c.id), eq(jobs.status, "unknown")) });
    const human = c.owner === "human" || tier === "T3" || !!uncertain;
    await tx.update(conversations).set({ latestMessageId: m.id, subject: input.subject, tier: human ? "T3" : tier, owner: human ? "human" : "agent", status: uncertain ? "delivery_unknown" : human ? "awaiting_human" : "queued", escalationReason: uncertain ? "Reconcile the previous uncertain delivery before responding" : tier === "T3" ? "Critical request detected at intake" : c.escalationReason, updatedAt: now }).where(eq(conversations.id, c.id));
    await tx.insert(jobs).values({ id: crypto.randomUUID(), conversationId: c.id, messageId: m.id, stage: human ? (c.freshdeskId ? "human_note" : "escalate") : "prepare", runAt: now, sendAfter: human ? now : responseDueAt(now) });
    return { accepted: true, deduped: false, conversationId: c.id, messageId: m.id, tier: human ? "T3" : tier };
  });
}

export async function supportEmailContext(c: Conversation, incoming: Message): Promise<SupportEmailContext> {
  const [history, purchaseRows] = await Promise.all([
    db.query.supportEmailMessages.findMany({ where: eq(messages.conversationId, c.id), orderBy: [desc(messages.createdAt), desc(messages.id)], limit: 20 }),
    db.query.orders.findMany({ where: sql`lower(${orders.email}) = ${c.email}`, orderBy: [desc(orders.placedAt)], limit: 21, columns: { id: true, number: true, buygoodsOrderId: true, konnektiveOrderId: true, productName: true, status: true, shippingTrackingId: true, total: true, currency: true, placedAt: true } }),
  ]);
  const requestedOrder = purchaseRows.find(o => [o.id, o.number, o.buygoodsOrderId, o.konnektiveOrderId].some(id => id && id.length >= 4 && new RegExp(`(?<![a-z0-9])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "i").test(`${incoming.subject}\n${incoming.text}`)));
  // An explicitly different order must not silently fall back to the sender's only order.
  const claimedText = /(?:order(?:\s+(?:number|id))?|pedido|commande|orden)\s*[:#]?\s*([a-z0-9-]{4,})/i.exec(`${incoming.subject}\n${incoming.text}`)?.[1];
  const claimedOrder = claimedText && (/\d/.test(claimedText) || /^[A-Z0-9-]{5,}$/.test(claimedText)) ? claimedText : null;
  const apparentId = /\b(?=[a-z0-9-]{6,}\b)(?=[a-z0-9-]*\d{2})[a-z0-9-]*[a-z][a-z0-9-]*\b/i.test(incoming.text);
  const selected = requestedOrder ?? (!claimedOrder && !apparentId && purchaseRows.length === 1 ? purchaseRows[0] : null);
  const publicUrl = process.env.SUPPORT_EMAIL_PUBLIC_APP_URL || "https://app.beneonature.com";
  const refundUrl = selected ? new URL(refundFormPath(selected.id), publicUrl).toString() : null;
  if (refundUrl && !refundUrl.startsWith("https://")) throw new Error("invalid_public_app_url");
  return {
    subject: incoming.subject, incoming: incoming.text, hasAttachments: incoming.attachments.length > 0,
    history: history.reverse().map(m => ({ direction: m.direction, text: m.text.slice(0, 4000) })),
    orders: purchaseRows.map(o => ({ number: o.buygoodsOrderId || o.konnektiveOrderId || o.number, product: o.productName, status: o.status, total: o.total, currency: o.currency, placedAt: o.placedAt.toISOString(), trackingUrl: o.shippingTrackingId ? buildTrackingUrl(o.shippingTrackingId) : null })),
    refundUrl,
  };
}

async function withConversationLock<T>(conversationId: string, fn: (tx: Transaction, c: Conversation) => Promise<T>) {
  const c = await db.query.supportEmailConversations.findFirst({ where: eq(conversations.id, conversationId) });
  if (!c) throw new Error("conversation_not_found");
  return db.transaction(async tx => {
    await lock(tx, lockKey(c));
    const current = (await tx.query.supportEmailConversations.findFirst({ where: eq(conversations.id, conversationId) }))!;
    return fn(tx, current);
  });
}

async function blockBehindUncertainDelivery(tx: Transaction, job: Job) {
  const uncertain = await tx.query.supportEmailJobs.findFirst({ where: and(eq(jobs.conversationId, job.conversationId), eq(jobs.status, "unknown"), ne(jobs.id, job.id)) });
  if (!uncertain) return false;
  await tx.update(jobs).set({ status: "blocked", error: "reconcile_unknown_delivery_first", runAt: new Date(Date.now() + 5 * 60_000) }).where(eq(jobs.id, job.id));
  return true;
}

async function prepareJob(job: Job, c: Conversation, incoming: Message) {
  const draft = await generateSupportEmail(await supportEmailContext(c, incoming));
  return withConversationLock(c.id, async (tx, current) => {
    if (current.owner !== "agent" || current.latestMessageId !== incoming.id) {
      await tx.update(jobs).set({ status: "cancelled", error: "conversation_changed" }).where(eq(jobs.id, job.id));
      return;
    }
    const human = draft.needsHuman || draft.tier === "T3";
    await tx.update(conversations).set({ tier: draft.tier, language: draft.language, owner: human ? "human" : "agent", status: human ? "awaiting_human" : "draft_ready", escalationReason: human ? draft.reason : null, updatedAt: new Date() }).where(eq(conversations.id, c.id));
    await tx.update(jobs).set({ draft, stage: human ? "escalate" : "send", status: human ? "queued" : supportEmailConfig().mode === "draft" ? "review" : "queued", runAt: human ? new Date() : job.sendAfter, attempts: 0, startedAt: null, error: null }).where(eq(jobs.id, job.id));
  });
}

async function recordOutgoing(tx: Transaction, c: Conversation, job: Job, incoming: Message, providerId: string) {
  await tx.insert(messages).values({ id: crypto.randomUUID(), conversationId: c.id, dedupeKey: `outgoing:${job.id}`, providerMessageId: providerId, direction: "outgoing", subject: incoming.subject, text: `${job.draft!.reply}\n\n${supportEmailConfig().signature}`, references: incoming.references, receivedAt: new Date() }).onConflictDoNothing({ target: messages.dedupeKey });
  await tx.update(jobs).set({ status: "succeeded", error: null }).where(eq(jobs.id, job.id));
  await tx.update(conversations).set({ status: c.owner === "agent" && c.latestMessageId === job.messageId ? "replied" : c.status === "delivery_unknown" ? "awaiting_human" : c.status, firstRepliedAt: c.firstRepliedAt ?? new Date(), updatedAt: new Date() }).where(eq(conversations.id, c.id));
}

async function deliverJob(job: Job, incoming: Message) {
  return withConversationLock(job.conversationId, async (tx, c) => {
    if (await blockBehindUncertainDelivery(tx, job)) return;
    if (c.owner !== "agent" || c.latestMessageId !== incoming.id) {
      await tx.update(jobs).set({ status: "cancelled", error: "conversation_changed" }).where(eq(jobs.id, job.id));
      return;
    }
    if (!job.draft?.reply) throw new Error("draft_missing");
    const payload = outboundEmailPayload({ requestId: job.id, conversationId: c.id, mailboxId: c.mailboxId, threadId: c.threadId, messageId: incoming.providerMessageId, rfcMessageId: incoming.rfcMessageId, references: incoming.references, email: c.email, subject: incoming.subject, text: `${job.draft.reply}\n\n${supportEmailConfig().signature}` });
    const result = await deliverSupportEmail(payload);
    if (result.status === "sent") return recordOutgoing(tx, c, job, incoming, result.messageId);
    await tx.update(jobs).set({ status: result.status, error: result.error, runAt: new Date(Date.now() + 5 * 60_000) }).where(eq(jobs.id, job.id));
    await tx.update(conversations).set({ status: result.status === "unknown" ? "delivery_unknown" : "delivery_blocked", updatedAt: new Date() }).where(eq(conversations.id, c.id));
  });
}

async function escalateJob(job: Job, incoming: Message) {
  return withConversationLock(job.conversationId, async (tx, c) => {
    if (await blockBehindUncertainDelivery(tx, job)) return;
    if (c.owner !== "human") {
      await tx.update(jobs).set({ status: "cancelled", error: "human_handoff_cancelled" }).where(eq(jobs.id, job.id));
      return;
    }
    // The same pilot gate applies to Freshdesk because its automations may email requesters.
    if (!canDeliverEmail(c.email)) {
      await tx.update(jobs).set({ status: "blocked", error: "human_sync_disabled_for_recipient", runAt: new Date(Date.now() + 5 * 60_000) }).where(eq(jobs.id, job.id));
      return;
    }
    const history = c.freshdeskId ? [incoming] : await tx.query.supportEmailMessages.findMany({ where: eq(messages.conversationId, c.id), orderBy: [asc(messages.createdAt)], limit: 50 });
    const description = `Conversation: ${c.id}\nMailbox: ${c.mailboxId}\nThread: ${c.threadId}\nTier: ${c.tier}\nReason: ${c.escalationReason || "Human support requested"}\n\n${history.map(m => `[${m.direction} ${m.receivedAt.toISOString()}]\n${m.text}\n${m.attachments.length ? `Attachments (ask n8n for files): ${m.attachments.map(a => `${a.name} (${a.id})`).join(", ")}` : ""}`).join("\n\n")}`;
    const result = await pushEmailToFreshdesk({ freshdeskId: c.freshdeskId, email: c.email, name: c.name, subject: c.subject, tier: c.tier, conversationId: c.id, description });
    if (result.status === "synced") {
      await tx.update(conversations).set({ owner: "human", status: "human", freshdeskId: result.freshdeskId, updatedAt: new Date() }).where(eq(conversations.id, c.id));
      await tx.update(jobs).set({ status: "succeeded", error: null }).where(eq(jobs.id, job.id));
    } else await tx.update(jobs).set({ status: result.status, error: result.error, runAt: new Date(Date.now() + 5 * 60_000) }).where(eq(jobs.id, job.id));
  });
}

export async function runSupportEmailJobs(limit = 3) {
  const mode = supportEmailConfig().mode;
  if (mode === "off") return { mode, processed: 0 };
  // A crash after starting an external write is uncertain. Never resend automatically.
  await db.update(jobs).set({ status: "unknown", error: "worker_interrupted_during_external_write" }).where(and(eq(jobs.status, "processing"), inArray(jobs.stage, ["send", "escalate", "human_note"]), lt(jobs.startedAt, new Date(Date.now() - 5 * 60_000))));
  await db.update(jobs).set({ status: "queued", startedAt: null }).where(and(eq(jobs.status, "processing"), eq(jobs.stage, "prepare"), lt(jobs.startedAt, new Date(Date.now() - 5 * 60_000))));
  const due = await db.query.supportEmailJobs.findMany({ where: and(inArray(jobs.status, ["queued", "blocked"]), lte(jobs.runAt, new Date())), orderBy: [asc(jobs.runAt)], limit: Math.min(10, Math.max(1, limit)) });
  let processed = 0;
  const deadline = Date.now() + 45_000;
  for (const candidate of due) {
    if (Date.now() >= deadline || (processed > 0 && Date.now() + 30_000 > deadline)) break;
    const [job] = await db.update(jobs).set({ status: "processing", startedAt: new Date(), attempts: sql`${jobs.attempts} + 1` }).where(and(eq(jobs.id, candidate.id), eq(jobs.status, candidate.status))).returning();
    if (!job) continue;
    processed++;
    try {
      const [c, incoming] = await Promise.all([db.query.supportEmailConversations.findFirst({ where: eq(conversations.id, job.conversationId) }), db.query.supportEmailMessages.findFirst({ where: eq(messages.id, job.messageId) })]);
      if (!c || !incoming) throw new Error("missing_job_context");
      if (mode === "pilot" && !canDeliverEmail(c.email)) {
        await db.update(jobs).set({ status: "blocked", error: "pilot_recipient_not_allowed", runAt: new Date(Date.now() + 5 * 60_000) }).where(eq(jobs.id, job.id));
        continue;
      }
      const uncertain = await db.query.supportEmailJobs.findFirst({ where: and(eq(jobs.conversationId, c.id), eq(jobs.status, "unknown"), ne(jobs.id, job.id)) });
      if (uncertain) {
        await db.update(jobs).set({ status: "blocked", error: "reconcile_unknown_delivery_first", runAt: new Date(Date.now() + 5 * 60_000) }).where(eq(jobs.id, job.id));
        continue;
      }
      if (job.stage === "prepare") await prepareJob(job, c, incoming);
      else if (job.stage === "send") await deliverJob(job, incoming);
      else await escalateJob(job, incoming);
    } catch (error) {
      const message = error instanceof Error ? error.message : "job_failed";
      const configuration = /not_configured|unsupported_llm_provider|invalid_public_app_url/.test(message);
      if (job.stage !== "prepare") {
        await db.update(jobs).set({ status: "unknown", error: "external_write_not_confirmed" }).where(eq(jobs.id, job.id));
      } else if (job.attempts >= 3 && !configuration) {
        await withConversationLock(job.conversationId, async (tx, c) => {
          if (c.latestMessageId !== job.messageId || c.owner !== "agent") {
            await tx.update(jobs).set({ status: "cancelled", error: "conversation_changed" }).where(eq(jobs.id, job.id));
            return;
          }
          await tx.update(conversations).set({ owner: "human", tier: "T3", status: "awaiting_human", escalationReason: "AI generation failed after three attempts", updatedAt: new Date() }).where(eq(conversations.id, c.id));
          await tx.update(jobs).set({ stage: "escalate", status: "queued", attempts: 0, runAt: new Date(), error: "generation_failed" }).where(eq(jobs.id, job.id));
        });
      } else await db.update(jobs).set({ status: configuration ? "blocked" : "queued", error: configuration ? "llm_configuration_missing" : "generation_failed", runAt: new Date(Date.now() + 5 * 60_000) }).where(eq(jobs.id, job.id));
    }
  }
  return { mode, processed };
}

export async function receiveFreshdeskEmailEvent(input: z.infer<typeof freshdeskEmailEventSchema>) {
  const c = await db.query.supportEmailConversations.findFirst({ where: input.conversationId ? eq(conversations.id, input.conversationId) : eq(conversations.freshdeskId, input.freshdeskId) });
  if (!c || (c.freshdeskId && c.freshdeskId !== input.freshdeskId)) throw Response.json({ error: "conversation_not_found" }, { status: 404 });
  return withConversationLock(c.id, async (tx, current) => {
    const dedupeKey = `freshdesk-event:${messageDedupeKey(String(input.freshdeskId), input.eventId)}`;
    const existing = await tx.query.supportEmailMessages.findFirst({ where: eq(messages.dedupeKey, dedupeKey) });
    if (existing) return { accepted: true, deduped: true };
    const lastEvent = await tx.query.supportEmailMessages.findFirst({ where: and(eq(messages.conversationId, current.id), eq(messages.direction, "human")), orderBy: [desc(messages.receivedAt)] });
    await tx.insert(messages).values({ id: crypto.randomUUID(), conversationId: current.id, dedupeKey, providerMessageId: input.messageId || input.eventId, direction: "human", subject: current.subject, text: input.text || input.event, receivedAt: new Date(input.occurredAt) });
    if (lastEvent && lastEvent.receivedAt > new Date(input.occurredAt)) return { accepted: true, ignored: true, reason: "older_human_event_saved" };
    await tx.update(conversations).set({ owner: "human", freshdeskId: input.freshdeskId, status: input.event === "ticket.resolved" ? "resolved" : "human", firstRepliedAt: input.event === "human.replied" ? current.firstRepliedAt ?? new Date(input.occurredAt) : current.firstRepliedAt, updatedAt: new Date() }).where(eq(conversations.id, current.id));
    if (!current.freshdeskId) await tx.update(jobs).set({ status: "succeeded", error: null }).where(and(eq(jobs.conversationId, current.id), eq(jobs.stage, "escalate"), eq(jobs.status, "unknown")));
    await tx.update(jobs).set({ status: "cancelled", error: "human_took_over" }).where(and(eq(jobs.conversationId, current.id), inArray(jobs.stage, ["prepare", "send"]), inArray(jobs.status, ["queued", "review", "blocked", "failed"])));
    return { accepted: true, deduped: false };
  });
}

export async function listSupportEmails(opts: { limit?: number; offset?: number; q?: string; tier?: string; owner?: string; orderBy?: string; direction?: string }) {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 10));
  const offset = Math.max(0, opts.offset ?? 0);
  const where = and(opts.q ? or(ilike(conversations.email, `%${opts.q}%`), ilike(conversations.subject, `%${opts.q}%`), ilike(conversations.name, `%${opts.q}%`)) : undefined, opts.tier ? eq(conversations.tier, opts.tier) : undefined, opts.owner ? eq(conversations.owner, opts.owner) : undefined);
  const order = opts.orderBy === "created" ? conversations.createdAt : conversations.updatedAt;
  const sort = opts.direction === "asc" ? asc : desc;
  const [rows, totals] = await Promise.all([db.select().from(conversations).where(where).orderBy(sort(order), sort(conversations.id)).limit(limit).offset(offset), db.select({ n: count() }).from(conversations).where(where)]);
  return { conversations: rows, total: totals[0].n, offset, limit, hasMore: offset + rows.length < totals[0].n, config: supportEmailReadiness() };
}

export function supportEmailReadiness() {
  const config = supportEmailConfig();
  return {
    mode: config.mode, provider: config.provider, model: config.model, minDelay: config.minDelay, maxDelay: config.maxDelay,
    inboundConfigured: !!process.env.SUPPORT_EMAIL_INBOUND_API_KEY,
    outboundConfigured: !!(process.env.SUPPORT_EMAIL_OUTBOUND_WEBHOOK_URL && process.env.SUPPORT_EMAIL_OUTBOUND_API_KEY),
    llmConfigured: !!config.model && (config.provider === "openai" ? !!process.env.OPENAI_API_KEY : config.provider === "anthropic" && !!process.env.ANTHROPIC_API_KEY),
    freshdeskConfigured: !!(process.env.FRESHDESK_DOMAIN && process.env.FRESHDESK_API_KEY && Number(process.env.SUPPORT_EMAIL_FRESHDESK_GROUP_ID) > 0),
    humanWebhookConfigured: !!process.env.SUPPORT_EMAIL_FRESHDESK_WEBHOOK_API_KEY,
    jobConfigured: !!process.env.SUPPORT_EMAIL_JOB_KEY,
    pilotRecipientsConfigured: config.allowedRecipients.length > 0,
  };
}

export async function supportEmailDetails(id: string) {
  const c = await db.query.supportEmailConversations.findFirst({ where: eq(conversations.id, id) });
  if (!c) throw Response.json({ error: "not_found" }, { status: 404 });
  const [history, queue] = await Promise.all([db.query.supportEmailMessages.findMany({ where: eq(messages.conversationId, id), orderBy: [desc(messages.createdAt), desc(messages.id)], limit: 100 }), db.query.supportEmailJobs.findMany({ where: eq(jobs.conversationId, id), orderBy: [desc(jobs.createdAt)], limit: 20 })]);
  return { conversation: c, messages: history.reverse(), jobs: queue, config: supportEmailReadiness(), canDeliver: canDeliverEmail(c.email) };
}

export async function supportEmailAction(id: string, action: "takeover" | "resume" | "approve" | "retry" | "confirm_sent" | "confirm_not_sent" | "confirm_synced", jobId?: string, providerMessageId?: string, confirmedFreshdeskId?: number) {
  return withConversationLock(id, async (tx, c) => {
    const now = new Date();
    if (action === "takeover") {
      await tx.update(conversations).set({ owner: "human", status: "awaiting_human", tier: "T3", escalationReason: "Staff took over", updatedAt: now }).where(eq(conversations.id, id));
      await tx.update(jobs).set({ status: "cancelled", error: "human_took_over" }).where(and(eq(jobs.conversationId, id), inArray(jobs.stage, ["prepare", "send"]), inArray(jobs.status, ["queued", "review", "blocked", "failed"])));
      if (c.latestMessageId) await tx.insert(jobs).values({ id: crypto.randomUUID(), conversationId: id, messageId: c.latestMessageId, stage: "escalate", sendAfter: now }).onConflictDoNothing({ target: [jobs.messageId, jobs.stage] });
    } else if (action === "resume") {
      const uncertain = await tx.query.supportEmailJobs.findFirst({ where: and(eq(jobs.conversationId, id), eq(jobs.status, "unknown")) });
      if (uncertain) throw Response.json({ error: "reconcile_unknown_delivery_first" }, { status: 409 });
      await tx.update(conversations).set({ owner: "agent", status: "queued", escalationReason: null, updatedAt: now }).where(eq(conversations.id, id));
      // Resume takes effect for the next inbound email; old drafts stay cancelled.
    } else {
      const job = jobId ? await tx.query.supportEmailJobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.conversationId, id)) }) : null;
      if (!job) throw Response.json({ error: "job_not_found" }, { status: 404 });
      if (action === "confirm_sent") {
        if (job.status !== "unknown" || job.stage !== "send" || !providerMessageId) throw Response.json({ error: "invalid_reconciliation" }, { status: 409 });
        const incoming = (await tx.query.supportEmailMessages.findFirst({ where: eq(messages.id, job.messageId) }))!;
        await recordOutgoing(tx, c, job, incoming, providerMessageId);
      } else if (action === "confirm_synced") {
        if (job.status !== "unknown" || !["escalate", "human_note"].includes(job.stage) || !Number.isSafeInteger(confirmedFreshdeskId) || !confirmedFreshdeskId || confirmedFreshdeskId <= 0 || (c.freshdeskId && c.freshdeskId !== confirmedFreshdeskId)) throw Response.json({ error: "invalid_reconciliation" }, { status: 409 });
        await tx.update(jobs).set({ status: "succeeded", error: null }).where(eq(jobs.id, job.id));
        await tx.update(conversations).set({ owner: "human", freshdeskId: confirmedFreshdeskId, status: c.status === "resolved" ? "resolved" : "human", updatedAt: now }).where(eq(conversations.id, id));
      } else {
        if ((action === "confirm_not_sent" && job.status !== "unknown") || (action === "approve" && job.status !== "review") || (action === "retry" && !["failed", "blocked"].includes(job.status))) throw Response.json({ error: "job_not_retryable" }, { status: 409 });
        if (job.stage === "send" && (c.owner !== "agent" || c.latestMessageId !== job.messageId)) {
          if (action !== "confirm_not_sent") throw Response.json({ error: "conversation_changed" }, { status: 409 });
          await tx.update(jobs).set({ status: "cancelled", error: "verified_not_sent_conversation_changed" }).where(eq(jobs.id, job.id));
          await tx.update(conversations).set({ status: c.owner === "human" ? "awaiting_human" : "queued", updatedAt: now }).where(eq(conversations.id, c.id));
          return { ok: true };
        }
        if (action === "approve" && !canDeliverEmail(c.email)) throw Response.json({ error: "enable_pilot_for_this_recipient_first" }, { status: 409 });
        await tx.update(jobs).set({ status: "queued", error: null, attempts: 0, startedAt: null, runAt: job.stage === "send" && job.sendAfter > now ? job.sendAfter : now }).where(eq(jobs.id, job.id));
      }
    }
    return { ok: true };
  });
}
