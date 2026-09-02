import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { withAdmin, logAdminAction } from "@/server/admin";
import { editableOrderFields } from "@/server/permissions";
import { invalidateCustomersCache } from "@/server/crm";
import { normalizeIngestPhone } from "@/lib/phone-format";

// Which order fields a role may touch is an allowlist computed from the
// role's permissions (editableOrderFields — plan §2.1), checked here on the
// server: CS gets only `address`, admin gets the full set. Editing a field
// locks it (see field-locks.ts) so the BuyGoods/Konnektive feed never
// clobbers a manual correction again until it's explicitly unlocked.
const patchSchema = z.object({
  address: z.string().max(500).optional(),
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(32).optional(),
  email: z.string().max(320).optional(),
  shippingTrackingId: z.string().max(100).optional(), // "" clears it — the only field that may be blank
});

export const PATCH = withAdmin(async (admin, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const allowed = new Set(editableOrderFields(admin.role));
  if (allowed.size === 0) return Response.json({ error: "no_permission" }, { status: 403 });

  const bodyRaw = await req.json().catch(() => null);
  if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  for (const field of Object.keys(bodyRaw)) {
    if (!allowed.has(field)) return Response.json({ error: "no_permission", field }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(bodyRaw);
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const data = parsed.data;

  for (const [key, value] of Object.entries(data)) {
    if (key !== "shippingTrackingId" && typeof value === "string" && value.trim() === "") {
      return Response.json({ error: "invalid_request", field: key }, { status: 400 });
    }
  }

  const existing = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!existing) return Response.json({ error: "not_found" }, { status: 404 });

  const patch: Partial<typeof orders.$inferInsert> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const editedFields: string[] = [];

  if (data.address !== undefined) {
    editedFields.push("address");
    before.address = existing.address;
    after.address = patch.address = data.address;
  }
  if (data.customerName !== undefined) {
    editedFields.push("customerName");
    before.customerName = existing.customerName;
    after.customerName = patch.customerName = data.customerName;
  }
  if (data.email !== undefined) {
    const normalized = data.email.toLowerCase().trim();
    editedFields.push("email");
    before.email = existing.email;
    after.email = patch.email = normalized;
  }
  if (data.shippingTrackingId !== undefined) {
    const value = data.shippingTrackingId.trim() || null;
    editedFields.push("shippingTrackingId");
    before.shippingTrackingId = existing.shippingTrackingId;
    after.shippingTrackingId = patch.shippingTrackingId = value;
  }
  if (data.customerPhone !== undefined) {
    // Same country-hint extraction as scripts/backfill-phone-e164.ts: the
    // last comma-separated segment of the address ("…, London, , SW1A 1AA,
    // United Kingdom"). Uses the address as edited in this same request, if any.
    const address = patch.address ?? existing.address;
    const country = address.split(",").map((s) => s.trim()).filter(Boolean).at(-1) ?? null;
    const e164 = normalizeIngestPhone(data.customerPhone, country);
    editedFields.push("customerPhone");
    before.customerPhone = existing.customerPhone;
    before.customerPhoneE164 = existing.customerPhoneE164;
    patch.customerPhone = data.customerPhone;
    patch.customerPhoneE164 = e164;
    after.customerPhone = data.customerPhone;
    after.customerPhoneE164 = e164;
  }

  if (editedFields.length === 0) return Response.json({ error: "invalid_request" }, { status: 400 });

  const lockedFields = existing.lockedFields ?? [];
  const nextLocked = [...new Set([...lockedFields, ...editedFields])];

  await db.update(orders).set({ ...patch, lockedFields: nextLocked }).where(eq(orders.id, id));

  await logAdminAction(admin, "order.update", { metadata: { orderId: id, before, after } });
  invalidateCustomersCache();

  return Response.json({ ok: true, lockedFields: nextLocked });
});
