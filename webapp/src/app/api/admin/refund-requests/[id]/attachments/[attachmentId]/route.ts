import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { refundRequests, refundUploads } from "@/db/schema";
import { withAdmin } from "@/server/admin";
export const GET = withAdmin(async (_admin, _req: Request, ctx: { params: Promise<{ id: string; attachmentId: string }> }) => {
  const { id, attachmentId } = await ctx.params;
  const refundRequest = await db.query.refundRequests.findFirst({ where: eq(refundRequests.id, id) });
  if (!refundRequest || !refundRequest.formDefinition.pages.flatMap(p => p.blocks).some(b => b.type === "file" && refundRequest.answers[b.id] === attachmentId)) return Response.json({ error: "not_found" }, { status: 404 });
  const upload = await db.query.refundUploads.findFirst({ where: and(eq(refundUploads.id, attachmentId), eq(refundUploads.userId, refundRequest.userId), eq(refundUploads.requestId, refundRequest.id)) });
  if (!upload) return Response.json({ error: "not_found" }, { status: 404 });
  return new Response(Buffer.from(upload.dataBase64, "base64"), { headers: { "Content-Type": upload.mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(upload.name).replace(/'/g, "%27")}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}, "customers:read");
