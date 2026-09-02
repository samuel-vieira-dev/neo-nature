import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { withAdmin, logAdminAction } from "@/server/admin";
import { loadCustomer } from "@/server/customer360";
import { invalidateCustomersCache } from "@/server/crm";
import { isValidE164, normalizePhone } from "@/lib/phone-format";

export const GET = withAdmin(async (_admin, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  // ?freshdesk=0 skips the live Freshdesk lookup (used by callers that only
  // need the local data — e.g. the future AI context fetch).
  const customer = await loadCustomer(id, { freshdesk: url.searchParams.get("freshdesk") !== "0" });
  if (!customer) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ customer });
}, "customers:read");

// Editing customer identity writes ONLY to `customers` — never to
// `users.email`/`users.phone`, which are the app's own login keys (see plan
// §2.1). Editing a field here locks it: the next webhook/identity-resolver
// enrichment skips it (stripLockedFields — see customer-identity.ts).
const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  primaryEmail: z.string().trim().min(1).max(320).nullable().optional(),
  primaryPhone: z.string().trim().min(1).max(32).nullable().optional(),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Accepts either an already-valid E.164 string or a loosely formatted
 * international number ("+1 555 123 4567"). There's no country picker on
 * this form (unlike the login screen), so a local/national format with no
 * "+" can't be resolved and is rejected.
 */
function normalizeAdminPhone(raw: string): string | null {
  if (isValidE164(raw)) return raw;
  const normalized = normalizePhone("", raw);
  return normalized && isValidE164(normalized) ? normalized : null;
}

export const PATCH = withAdmin(async (admin, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const existing = await db.query.customers.findFirst({ where: eq(customers.id, id) });
  if (!existing) return Response.json({ error: "not_found" }, { status: 404 });

  const patch: Partial<typeof customers.$inferInsert> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const editedFields: string[] = [];

  if (parsed.data.name !== undefined) {
    editedFields.push("name");
    before.name = existing.name;
    patch.name = parsed.data.name;
    after.name = parsed.data.name;
  }

  if (parsed.data.primaryEmail !== undefined) {
    const raw = parsed.data.primaryEmail;
    const normalized = raw === null ? null : raw.toLowerCase().trim();
    if (normalized !== null && !EMAIL_RE.test(normalized)) {
      return Response.json({ error: "invalid_email" }, { status: 400 });
    }
    if (normalized !== null) {
      const taken = await db.query.customers.findFirst({
        where: and(eq(customers.primaryEmail, normalized), ne(customers.id, id)),
      });
      if (taken) return Response.json({ error: "email_taken" }, { status: 409 });
    }
    editedFields.push("primaryEmail");
    before.primaryEmail = existing.primaryEmail;
    patch.primaryEmail = normalized;
    after.primaryEmail = normalized;
  }

  if (parsed.data.primaryPhone !== undefined) {
    const raw = parsed.data.primaryPhone;
    const normalized = raw === null ? null : normalizeAdminPhone(raw);
    if (raw !== null && normalized === null) {
      return Response.json({ error: "invalid_phone" }, { status: 400 });
    }
    editedFields.push("primaryPhone");
    before.primaryPhone = existing.primaryPhone;
    patch.primaryPhone = normalized;
    after.primaryPhone = normalized;
  }

  if (editedFields.length === 0) return Response.json({ error: "invalid_request" }, { status: 400 });

  const lockedFields = existing.lockedFields ?? [];
  const nextLocked = [...new Set([...lockedFields, ...editedFields])];

  await db
    .update(customers)
    .set({ ...patch, lockedFields: nextLocked, updatedAt: new Date() })
    .where(eq(customers.id, id));

  await logAdminAction(admin, "customer.update", { metadata: { customerId: id, before, after } });
  invalidateCustomersCache();

  return Response.json({ ok: true, lockedFields: nextLocked });
}, "customers:write");
