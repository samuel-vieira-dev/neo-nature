import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { createFreshdeskTicket } from "@/server/freshdesk";

// ---------------------------------------------------------------------------
// Ticket creation — the local mirror + Freshdesk push shared by the app's own
// "Contact support" (src/app/api/tickets/route.ts) and the admin 360's "Open
// ticket for any customer" (src/app/api/admin/customers/[id]/tickets/route.ts).
// The local row is written first and is never lost even if Freshdesk is down
// or unconfigured; syncStatus tracks whether the push succeeded.
// ---------------------------------------------------------------------------

export const serializeTicket = (t: typeof tickets.$inferSelect) => ({
  id: t.id,
  subject: t.subject,
  orderNumber: t.orderNumber,
  kind: t.kind,
  status: t.status,
  lastMessage: t.lastMessage,
  date: t.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
});

/**
 * Mints the next ticket id. `tickets.id` is the global primary key, so it
 * must be unique across every user — a DB sequence gives us that atomically,
 * even with concurrent requests. Keeps the customer-facing "T-####" display
 * format (it shows up in our copy and in Freshdesk ticket descriptions).
 */
async function nextTicketId() {
  const [row] = await db.execute<{ n: string }>(sql`select nextval('ticket_id_seq') as n`);
  return `T-${row.n}`;
}

export type CreateTicketInput = {
  userId: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  subject: string;
  description?: string;
  kind: "support" | "refund" | "billing";
  orderNumber?: string;
  /** Idempotency key: same submission intent retried => same ticket, one Freshdesk push. */
  clientRequestId?: string;
};

export type CreateTicketResult =
  | {
      ok: true;
      ticket: ReturnType<typeof serializeTicket>;
      deduped: boolean;
      freshdeskId: number | null;
      syncStatus: string;
    }
  | { ok: false; error: "duplicate_request" };

export async function createTicketForUser(input: CreateTicketInput): Promise<CreateTicketResult> {
  const orderNumber = input.orderNumber ?? "—";
  const id = await nextTicketId();

  // 1) Persist the local mirror first — we must never lose the customer's
  //    message, even if Freshdesk is down or not yet configured.
  //
  //    ON CONFLICT on the idempotency key is what makes a burst of taps safe:
  //    the losing requests insert nothing and return the ticket the winner
  //    created, so step 2 below (the Freshdesk push) runs exactly once per
  //    intent. A null clientRequestId never conflicts, so callers without one
  //    (e.g. the admin route) behave as before.
  const [inserted] = await db
    .insert(tickets)
    .values({
      id,
      userId: input.userId,
      subject: input.subject,
      orderNumber,
      kind: input.kind,
      email: input.email || input.phone || "",
      clientRequestId: input.clientRequestId,
      lastMessage:
        input.kind === "refund"
          ? "Refund request received — we'll analyze it within 48 hours and send further instructions"
          : "Our team usually replies by email within an hour.",
    })
    .onConflictDoNothing({ target: tickets.clientRequestId })
    .returning();

  if (!inserted) {
    const existing = await db.query.tickets.findFirst({
      where: eq(tickets.clientRequestId, input.clientRequestId!),
    });
    // The key is a client-minted UUID, so this should always be the same
    // customer — but never hand back another account's ticket if it isn't.
    if (!existing || existing.userId !== input.userId) {
      return { ok: false, error: "duplicate_request" };
    }
    return {
      ok: true,
      ticket: serializeTicket(existing),
      deduped: true,
      freshdeskId: existing.freshdeskId,
      syncStatus: existing.syncStatus,
    };
  }

  const row = inserted;

  // 2) Push to Freshdesk (system of record). Failure degrades gracefully:
  //    the ticket stays local with sync_status so ops can reconcile.
  // SMS-only customers have no email — Freshdesk falls back to phone + name.
  const result = await createFreshdeskTicket({
    email: input.email || undefined,
    phone: input.phone || undefined,
    name: input.name || undefined,
    subject: input.subject,
    description: input.description,
    kind: input.kind,
    orderNumber,
  });
  if (result.ok) {
    await db
      .update(tickets)
      .set({ freshdeskId: result.freshdeskId, syncStatus: "synced" })
      .where(eq(tickets.id, id));
  } else if (result.reason === "not_configured") {
    await db.update(tickets).set({ syncStatus: "local_only" }).where(eq(tickets.id, id));
  }
  // on api_error we leave syncStatus = "pending" for a future retry/reconcile

  const syncStatus = result.ok ? "synced" : row.syncStatus;
  return {
    ok: true,
    ticket: serializeTicket({ ...row, syncStatus }),
    deduped: false,
    freshdeskId: result.ok ? result.freshdeskId : row.freshdeskId,
    syncStatus,
  };
}
