import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { refundForms } from "@/db/schema";
import { defaultRefundForm } from "@/lib/refund/form";
export async function getRefundForm(version?: number) {
  const row = await db.query.refundForms.findFirst({
    orderBy: [desc(refundForms.id)],
    where: version === undefined ? undefined : eq(refundForms.id, version),
  });
  if (!row && version !== undefined && version !== 0) return null;
  return row ? { version: row.id, form: row.definition } : { version: 0, form: defaultRefundForm };
}
