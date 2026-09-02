import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { withAdmin, logAdminAction } from "@/server/admin";
import { editableOrderFields } from "@/server/permissions";
import { invalidateCustomersCache } from "@/server/crm";

// Same per-field permission rule as PATCH: unlocking a field you can't edit
// is refused the same way editing it would be.
export const DELETE = withAdmin(async (admin, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const field = new URL(req.url).searchParams.get("field");
  if (!field) return Response.json({ error: "invalid_request" }, { status: 400 });

  const allowed = new Set(editableOrderFields(admin.role));
  if (!allowed.has(field)) return Response.json({ error: "no_permission", field }, { status: 403 });

  const existing = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!existing) return Response.json({ error: "not_found" }, { status: 404 });

  const nextLocked = (existing.lockedFields ?? []).filter((f) => f !== field);
  await db.update(orders).set({ lockedFields: nextLocked }).where(eq(orders.id, id));

  await logAdminAction(admin, "order.unlock", { metadata: { orderId: id, field } });
  invalidateCustomersCache();

  return Response.json({ ok: true, lockedFields: nextLocked });
});
