/**
 * Which purchase a support ticket is about. Shared by the email agent (order facts for the
 * reply) and support reports (filter by product): the order the customer cites in the
 * message, otherwise their most recent order.
 */
type OrderIds = { id: string; number: string | null; buygoodsOrderId: string | null; konnektiveOrderId: string | null };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** An order whose id/number appears as a whole token (4+ chars) in the text. */
export function citedOrder<T extends OrderIds>(text: string, orders: T[]): T | undefined {
  return orders.find(o => [o.id, o.number, o.buygoodsOrderId, o.konnektiveOrderId].some(id => id && id.length >= 4 && new RegExp(`(?<![a-z0-9])${escape(id)}(?![a-z0-9])`, "i").test(text)));
}

/** Reports rule: the cited order, else the most recent one (null when the sender has no orders). */
export function ticketProductOrder<T extends OrderIds & { placedAt: Date }>(text: string, orders: T[]): T | null {
  return citedOrder(text, orders) ?? [...orders].sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime())[0] ?? null;
}
