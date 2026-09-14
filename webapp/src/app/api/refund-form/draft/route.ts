import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { refundRequests, refundUploads } from "@/db/schema";
import { refundProgressOutcome } from "@/lib/refund/form";
import { getRefundForm } from "@/server/refund-form";
import { withUser } from "@/server/session";

const draftSchema = z.object({
  requestId: z.uuid(),
  version: z.number().int().nonnegative(),
  currentPageId: z.string().min(1).max(100),
  answers: z.record(z.string().max(100), z.string().max(4000)).refine(a => Object.keys(a).length <= 40),
});

export const POST = withUser(async (user, req: Request) => {
  const parsed = draftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { requestId, version, currentPageId, answers } = parsed.data;
  const config = await getRefundForm(version);
  if (!config) return Response.json({ error: "unknown_form_version" }, { status: 400 });
  if (!config.form.pages.some(page => page.id === currentPageId)) return Response.json({ error: "invalid_page" }, { status: 400 });

  const fields = new Map(config.form.pages.flatMap(page => page.blocks).filter(block => block.type !== "copy").map(block => [block.id, block]));
  const clean = Object.fromEntries(Object.entries(answers).filter(([id, value]) => {
    const field = fields.get(id);
    if (!field) return false;
    if ((field.type === "choice" || field.type === "checkbox") && value && !field.options?.some(option => option.id === value)) return false;
    return true;
  }).map(([id, value]) => [id, value.trim()]));
  const fileEntries = Object.entries(clean).filter(([id]) => fields.get(id)?.type === "file");
  if (fileEntries.length) {
    const uploads = await db.select({ id: refundUploads.id, fieldId: refundUploads.fieldId }).from(refundUploads).where(and(
      eq(refundUploads.userId, user.id), eq(refundUploads.requestId, requestId), inArray(refundUploads.id, fileEntries.map(([, value]) => value)),
    ));
    for (const [fieldId, uploadId] of fileEntries) if (!uploads.some(upload => upload.id === uploadId && upload.fieldId === fieldId)) delete clean[fieldId];
  }
  const outcome = refundProgressOutcome(config.form, currentPageId, clean);
  const result = await db.transaction(async tx => {
    const existing = await tx.query.refundRequests.findFirst({ where: eq(refundRequests.id, requestId) });
    if (existing?.userId !== undefined && existing.userId !== user.id) return "duplicate_request";
    if (existing && ["refund", "retained"].includes(existing.outcome)) return null;
    await tx.insert(refundRequests).values({
      id: requestId, userId: user.id, formVersion: version, formDefinition: config.form,
      answers: clean, currentPageId, outcome,
    }).onConflictDoUpdate({ target: refundRequests.id, set: { answers: clean, currentPageId, outcome, updatedAt: new Date() } });
    return null;
  });
  if (result) return Response.json({ error: result }, { status: 409 });
  return Response.json({ ok: true, outcome });
});
