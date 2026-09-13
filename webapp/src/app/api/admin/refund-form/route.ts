import { db } from "@/db";
import { refundForms } from "@/db/schema";
import { withAdmin, logAdminAction } from "@/server/admin";
import { getRefundForm } from "@/server/refund-form";
import { formSchema } from "@/lib/refund/form";
import { sql } from "drizzle-orm";
import { z } from "zod";
export const GET = withAdmin(async () => Response.json(await getRefundForm()), "refund-form:write");
const update = z.object({ version: z.number().int().nonnegative(), form: formSchema });
export const PUT = withAdmin(async (admin, req: Request) => {
  const parsed = update.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid form definition. Check required labels and rules." }, { status: 400 });
  const result = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7263918)`);
    const [latest] = await tx.select({ id: refundForms.id }).from(refundForms).orderBy(sql`${refundForms.id} desc`).limit(1);
    if ((latest?.id ?? 0) !== parsed.data.version) return null;
    const [row] = await tx.insert(refundForms).values({ definition: parsed.data.form }).returning({ id: refundForms.id });
    return row;
  });
  if (!result) return Response.json({ error: "Another administrator updated the form. Reload before saving." }, { status: 409 });
  await logAdminAction(admin, "refund_form.updated", { metadata: { version: result.id } });
  return Response.json({ version: result.id, form: parsed.data.form });
}, "refund-form:write");
