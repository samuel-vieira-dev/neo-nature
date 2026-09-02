import { z } from "zod";
import { withAdmin, logAdminAction } from "@/server/admin";
import { loadCustomer } from "@/server/customer360";
import { findOrProvisionAccount } from "@/server/leads";
import { createTicketForUser } from "@/server/tickets";

// Opens a support ticket for ANY customer from the 360, even one who never
// signed into the app. Same account-resolution path "View as customer" uses
// (findOrProvisionAccount — src/server/leads.ts): a lead gets the same bare
// `users` row an OTP login would create, never a fake onboarding. Ticket
// creation itself is the exact path the app's own "Contact support" uses —
// see src/server/tickets.ts.
const bodySchema = z.object({
  subject: z.string().min(2).max(200),
  description: z.string().max(4000).optional(),
  kind: z.enum(["support", "refund", "billing"]).default("support"),
  orderNumber: z.string().max(40).optional(),
});

export const POST = withAdmin(async (admin, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const customer = await loadCustomer(id, { freshdesk: false });
  if (!customer) return Response.json({ error: "not_found" }, { status: 404 });

  let userId = customer.accounts[0]?.userId ?? null;
  let provisioned = false;
  if (!userId) {
    const resolved = await findOrProvisionAccount({ email: customer.primaryEmail, phone: customer.primaryPhone });
    if (!resolved) return Response.json({ error: "no_contact" }, { status: 422 });
    userId = resolved.user.id;
    provisioned = resolved.provisioned;
  }

  const { subject, description, kind, orderNumber } = parsed.data;
  const result = await createTicketForUser({
    userId,
    email: customer.primaryEmail,
    phone: customer.primaryPhone,
    name: customer.name || null,
    subject,
    description,
    kind,
    orderNumber,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });

  await logAdminAction(admin, "ticket.create", {
    targetUserId: userId,
    metadata: { customerId: id, ticketId: result.ticket.id, freshdeskId: result.freshdeskId, provisioned },
  });

  return Response.json({ ok: true, ticket: result.ticket, provisioned });
}, "tickets:write");
