import { and, desc, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, supportAiQuestions, supportEmailConversations as conversations, supportEmailMessages as messages } from "@/db/schema";
import { zonedDayStart } from "@/lib/business-hours";
import { buildSupportReport, type ReportMessage, type SupportReport } from "@/lib/support-report";
import { ticketProductOrder } from "./support-ticket-product";

export type ReportRange = { from: string; to: string };
export type AiQuestionsReport = {
  total: number;
  ai: number;
  search: number;
  orderQuestions: number;
  topArticles: { title: string; count: number }[];
  recent: { question: string; source: string; orderQuestion: boolean; createdAt: string }[];
};

/** Inclusive days in the report time zone → [start, end). */
function bounds(range: ReportRange) {
  const end = zonedDayStart(range.to);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: zonedDayStart(range.from), end: zonedDayStart(end.toISOString().slice(0, 10)) };
}

/**
 * Tickets created in the range. Freshdesk imports are history without our reply timeline, so
 * they stay out of the SLA numbers.
 */
export async function getSupportReport(range: ReportRange, now = new Date()): Promise<SupportReport> {
  const { start, end } = bounds(range);
  const inRange = and(isNull(conversations.legacyTicketId), gte(conversations.createdAt, start), lt(conversations.createdAt, end));
  const rows = await db.select({ id: conversations.id, ticketNumber: conversations.ticketNumber, subject: conversations.subject, email: conversations.email, tier: conversations.tier, ticketStatus: conversations.ticketStatus, status: conversations.status, createdAt: conversations.createdAt, resolvedAt: conversations.resolvedAt }).from(conversations).where(inRange);
  if (!rows.length) return buildSupportReport([], now);

  const ids = sql`(select ${conversations.id} from ${conversations} where ${inRange})`;
  const emails = [...new Set(rows.map((r) => r.email.toLowerCase()).filter(Boolean))];
  const [timeline, firstTexts, purchaseRows] = await Promise.all([
    db.select({ conversationId: messages.conversationId, direction: messages.direction, authorAdminId: messages.authorAdminId, receivedAt: messages.receivedAt }).from(messages).where(and(sql`${messages.conversationId} in ${ids}`, inArray(messages.direction, ["incoming", "outgoing"]))),
    db.execute<{ conversation_id: string; text: string }>(sql`select distinct on (${messages.conversationId}) ${messages.conversationId} as conversation_id, left(${messages.subject} || ' ' || ${messages.text}, 4000) as text from ${messages} where ${messages.conversationId} in ${ids} and ${messages.direction} = 'incoming' order by ${messages.conversationId}, ${messages.receivedAt}`),
    emails.length ? db.select({ id: orders.id, email: orders.email, number: orders.number, buygoodsOrderId: orders.buygoodsOrderId, konnektiveOrderId: orders.konnektiveOrderId, productName: orders.productName, placedAt: orders.placedAt }).from(orders).where(inArray(sql`lower(${orders.email})`, emails)) : Promise.resolve([]),
  ]);

  const byTicket = new Map<string, ReportMessage[]>();
  for (const m of timeline) byTicket.set(m.conversationId, [...(byTicket.get(m.conversationId) ?? []), m]);
  const textOf = new Map([...firstTexts].map((r) => [r.conversation_id, r.text]));
  const ordersOf = new Map<string, typeof purchaseRows>();
  for (const o of purchaseRows) ordersOf.set(o.email.toLowerCase(), [...(ordersOf.get(o.email.toLowerCase()) ?? []), o]);

  return buildSupportReport(rows.map((r) => ({
    ...r,
    product: ticketProductOrder(textOf.get(r.id) ?? r.subject, ordersOf.get(r.email.toLowerCase()) ?? [])?.productName || null,
    messages: byTicket.get(r.id) ?? [],
  })), now);
}

/** What customers ask the in-app Ask AI, to find gaps in the knowledge base. */
export async function getAiQuestionsReport(range: ReportRange): Promise<AiQuestionsReport> {
  const { start, end } = bounds(range);
  const where = and(gte(supportAiQuestions.createdAt, start), lt(supportAiQuestions.createdAt, end));
  const [rows, recent] = await Promise.all([
    db.select({ source: supportAiQuestions.source, orderQuestion: supportAiQuestions.orderQuestion, related: supportAiQuestions.related }).from(supportAiQuestions).where(where),
    db.select({ question: supportAiQuestions.question, source: supportAiQuestions.source, orderQuestion: supportAiQuestions.orderQuestion, createdAt: supportAiQuestions.createdAt }).from(supportAiQuestions).where(where).orderBy(desc(supportAiQuestions.createdAt)).limit(50),
  ]);
  const articles = new Map<string, number>();
  for (const r of rows) if (r.related[0]) articles.set(r.related[0], (articles.get(r.related[0]) ?? 0) + 1);
  return {
    total: rows.length,
    ai: rows.filter((r) => r.source === "ai").length,
    search: rows.filter((r) => r.source === "search").length,
    orderQuestions: rows.filter((r) => r.orderQuestion).length,
    topArticles: [...articles].map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    recent: recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}
