export const TICKET_STATUSES = ["new", "open", "pending", "on_hold", "resolved", "closed"] as const;
export type TicketStatus = typeof TICKET_STATUSES[number];
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = { new: "New", open: "Open", pending: "Pending", on_hold: "On hold", resolved: "Resolved", closed: "Closed" };
export const internalSupportEnabled = () => process.env.SUPPORT_TICKETING_BACKEND === "internal";

export function emailNotAnswered(ticket: { status: string; requiresHuman: boolean }) {
  return ticket.requiresHuman || ["queued", "draft_ready", "ai_draft_not_sent", "draft_needs_review", "generation_failed", "delivery_blocked"].includes(ticket.status);
}
