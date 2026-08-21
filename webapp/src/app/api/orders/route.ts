import { withUser } from "@/server/session";
import { loadUserOrders } from "@/server/orders";

// Every purchase of the signed-in user. Upsell/downsell rows are folded into
// their parent order (see src/server/order-groups.ts) — one purchase, many items.
export const GET = withUser(async (user) => {
  return Response.json({ orders: await loadUserOrders(user) });
});
