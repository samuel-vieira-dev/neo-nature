import { eq } from "drizzle-orm";
import { db } from "@/db";
import { supportTicketAttachments } from "@/db/schema";
import { withAdmin } from "@/server/admin";
export const GET = withAdmin(async (_admin, _request: Request, ctx: { params: Promise<{id:string}> }) => {
  const row=await db.query.supportTicketAttachments.findFirst({where:eq(supportTicketAttachments.id,(await ctx.params).id)});
  if(!row) return Response.json({error:"not_found"},{status:404});
  return new Response(Buffer.from(row.data,"base64"),{headers:{"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
},"support:read");
