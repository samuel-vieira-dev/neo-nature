import { sql } from "drizzle-orm";
import { supportEmailConversations as conversations } from "@/db/schema";

export const isResolvedTicketStatus = (status: string) => status === "resolved" || status === "closed";

/**
 * `resolvedAt` value to write with a new ticket status: keeps the first resolution time while the
 * ticket stays resolved/closed, stamps now() when it gets there, clears it when it reopens.
 */
export const resolvedAtFor = (status: string) => (isResolvedTicketStatus(status) ? sql`coalesce(${conversations.resolvedAt}, now())` : null);
