import { withUser } from "@/server/session";
import { loadUserOrder } from "@/server/orders";

export const GET = withUser(async (user, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  // Resolves folded upsell/downsell ids to their parent purchase too, so an
  // old push-notification link to an add-on order still opens the purchase.
  const order = await loadUserOrder(user, id);
  if (!order) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ order });
});
