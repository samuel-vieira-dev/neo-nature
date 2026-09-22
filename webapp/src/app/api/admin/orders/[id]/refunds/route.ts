import { withAdmin } from "@/server/admin";
import { refundInput, RefundError } from "@/server/order-refund-policy";
import { processOrderRefund, refundSummary } from "@/server/order-refunds";

type Context = { params: Promise<{ id: string }> };
async function respond(fn: () => Promise<unknown>) {
  try { return Response.json(await fn(), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { if (e instanceof RefundError) return Response.json({ error: e.message }, { status: e.status }); throw e; }
}
export const GET = withAdmin(async (_admin, _req: Request, ctx: Context) => {
  const { id } = await ctx.params;
  return respond(() => refundSummary(id));
}, "orders:refund");
export const POST = withAdmin(async (admin, req: Request, ctx: Context) => {
  const parsed = refundInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { id } = await ctx.params;
  return respond(() => processOrderRefund(id, parsed.data, admin));
}, "orders:refund");
