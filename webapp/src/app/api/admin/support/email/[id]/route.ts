import { z } from "zod";
import { logAdminAction, withAdmin } from "@/server/admin";
import { supportEmailAction, supportEmailDetails } from "@/server/support-email";
import { readWebhookJson } from "@/server/support-email-contract";

type Context = { params: Promise<{ id: string }> };
const inputSchema = z.object({ action: z.enum(["takeover", "resume", "approve", "retry", "confirm_sent", "confirm_not_sent", "confirm_synced"]), jobId: z.uuid().optional(), providerMessageId: z.string().min(1).max(256).optional(), freshdeskId: z.number().int().positive().optional() });
export const GET = withAdmin(async (_admin, _request: Request, ctx: Context) => {
  return Response.json(await supportEmailDetails((await ctx.params).id));
}, "support:read");
export const POST = withAdmin(async (admin, request: Request, ctx: Context) => {
  const parsed = inputSchema.safeParse(await readWebhookJson(request));
  if (!parsed.success) return Response.json({ error: "invalid_action" }, { status: 400 });
  const { id } = await ctx.params;
  const { action, jobId, providerMessageId, freshdeskId } = parsed.data;
  const result = await supportEmailAction(id, action, jobId, providerMessageId, freshdeskId);
  await logAdminAction(admin, `support-email.${action}`, { metadata: { conversationId: id, jobId, providerMessageId, freshdeskId } });
  return Response.json(result);
}, "tickets:write");
