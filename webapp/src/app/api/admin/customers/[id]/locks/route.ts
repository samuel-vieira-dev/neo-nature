import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { withAdmin, logAdminAction } from "@/server/admin";
import { invalidateCustomersCache } from "@/server/crm";

// Removes one field from `customers.locked_fields` so the identity resolver
// (customer-identity.ts) is free to enrich it again from the webhook feed —
// see plan §2.1. Same permission as editing the field in the first place.
export const DELETE = withAdmin(async (admin, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const field = new URL(req.url).searchParams.get("field");
  if (!field) return Response.json({ error: "invalid_request" }, { status: 400 });

  const existing = await db.query.customers.findFirst({ where: eq(customers.id, id) });
  if (!existing) return Response.json({ error: "not_found" }, { status: 404 });

  const nextLocked = (existing.lockedFields ?? []).filter((f) => f !== field);
  await db.update(customers).set({ lockedFields: nextLocked, updatedAt: new Date() }).where(eq(customers.id, id));

  await logAdminAction(admin, "customer.unlock", { metadata: { customerId: id, field } });
  invalidateCustomersCache();

  return Response.json({ ok: true, lockedFields: nextLocked });
}, "customers:write");
