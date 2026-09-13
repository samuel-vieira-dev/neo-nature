import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tickets, refundUploads } from "@/db/schema";
import { withAdmin } from "@/server/admin";
export const GET = withAdmin(async (_admin, _req: Request, ctx: { params: Promise<{ id: string; attachmentId: string }> }) => {
  const { id, attachmentId } = await ctx.params;
  const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
  if (!ticket?.refundResponse || !ticket.refundResponse.form.pages.flatMap(p => p.blocks).some(b => b.type === "file" && ticket.refundResponse!.answers[b.id] === attachmentId)) return Response.json({ error: "not_found" }, { status: 404 });
  const upload = await db.query.refundUploads.findFirst({ where: and(eq(refundUploads.id, attachmentId), eq(refundUploads.userId, ticket.userId), eq(refundUploads.requestId, ticket.clientRequestId!)) });
  if (!upload) return Response.json({ error: "not_found" }, { status: 404 });
  return new Response(Buffer.from(upload.dataBase64, "base64"), { headers: { "Content-Type": upload.mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(upload.name).replace(/'/g, "%27")}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}, "customers:read");
