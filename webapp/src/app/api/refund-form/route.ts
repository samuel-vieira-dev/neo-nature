import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { refundUploads, tickets } from "@/db/schema";
import { withUser } from "@/server/session";
import { getRefundForm } from "@/server/refund-form";
import { createTicketForUser, serializeTicket } from "@/server/tickets";
import { EMAIL_FIELD, NAME_FIELD, PHONE_FIELD, ORDER_FIELD, responseDescription, validateSubmission } from "@/lib/refund/form";

export const GET = withUser(async user => Response.json({ ...await getRefundForm(), defaults: {
  [EMAIL_FIELD]: user.email ?? "", [NAME_FIELD]: user.fullName || user.name || "", [PHONE_FIELD]: user.phone ?? "",
} }));
const submissionSchema = z.object({ version: z.number().int().nonnegative(), clientRequestId: z.uuid(), answers: z.record(z.string().max(100), z.string().max(4000)).refine(a => Object.keys(a).length <= 40) });
export const POST = withUser(async (user, req: Request) => {
  const parsed = submissionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { version, answers, clientRequestId } = parsed.data;
  const existing = await db.query.tickets.findFirst({ where: eq(tickets.clientRequestId, clientRequestId) });
  if (existing) {
    if (existing.userId !== user.id || !existing.refundResponse) return Response.json({ error: "duplicate_request" }, { status: 409 });
    return Response.json({ ticket: serializeTicket(existing), endPage: existing.refundResponse.endPage });
  }
  const config = await getRefundForm(version);
  if (!config) return Response.json({ error: "unknown_form_version" }, { status: 400 });
  const result = validateSubmission(config.form, answers);
  if (!result.ok) return Response.json(result, { status: 400 });
  const fields = config.form.pages.flatMap(p => p.blocks).filter(b => b.type === "file" && result.answers[b.id]);
  const uploads = fields.length ? await db.select({ id: refundUploads.id, fieldId: refundUploads.fieldId, mime: refundUploads.mime, size: refundUploads.size }).from(refundUploads).where(and(eq(refundUploads.userId, user.id), eq(refundUploads.requestId, clientRequestId), inArray(refundUploads.id, fields.map(f => result.answers[f.id])))) : [];
  if (fields.some(f => !uploads.some(u => u.id === result.answers[f.id] && u.fieldId === f.id && u.mime.startsWith(`${f.accept}/`) && u.size <= (f.maxMB ?? 20) * 1024 * 1024)))
    return Response.json({ error: "Please upload all required attachments again." }, { status: 400 });
  const refundResponse = { version, form: config.form, answers: result.answers, outcome: result.outcome, endPage: result.endPage };
  const ticket = await createTicketForUser({ userId: user.id, email: user.email, phone: user.phone, name: user.fullName || user.name,
    subject: result.outcome === "refund" ? "Refund request" : "Customer chose to continue the program", kind: result.outcome === "refund" ? "refund" : "support",
    orderNumber: result.answers[ORDER_FIELD], description: responseDescription(refundResponse).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>"), clientRequestId, refundResponse,
  });
  if (!ticket.ok) return Response.json({ error: ticket.error }, { status: 409 });
  return Response.json({ ticket: ticket.ticket, endPage: result.endPage });
});
