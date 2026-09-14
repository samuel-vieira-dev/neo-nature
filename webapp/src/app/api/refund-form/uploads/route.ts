import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { refundRequests, refundUploads, tickets } from "@/db/schema";
import { withRefundUser } from "@/server/session";
import { getRefundForm } from "@/server/refund-form";
import { makeLimiter } from "@/server/rate-limit";
const limiter = makeLimiter({ max: 30, windowMs: 60 * 60 * 1000 });
const MAX_BYTES = 20 * 1024 * 1024;
const metadata = z.object({ requestId: z.uuid(), fieldId: z.string().max(100), version: z.coerce.number().int().nonnegative() });
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "video/mp4", "video/quicktime", "video/webm"]);
export const POST = withRefundUser(async ({ user }, req: Request) => {
  if (!limiter.hit(user.id).allowed) return Response.json({ error: "Too many uploads. Please try again later." }, { status: 429 });
  // Read with a hard bound even when Content-Length is absent or forged.
  const reader = req.body?.getReader();
  if (!reader) return Response.json({ error: "missing_file" }, { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES + 64 * 1024) { await reader.cancel(); return Response.json({ error: "Maximum file size is 20 MB." }, { status: 413 }); }
    chunks.push(value);
  }
  const data = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": req.headers.get("Content-Type") ?? "" } }).formData().catch(() => null);
  const parsed = metadata.safeParse(data && Object.fromEntries(["requestId", "fieldId", "version"].map(k => [k, data.get(k)])));
  const file = data?.get("file");
  if (!parsed.success || !(file instanceof File) || !file.size || file.size > MAX_BYTES || !allowed.has(file.type)) return Response.json({ error: "Upload a JPG, PNG, WebP, HEIC, MP4, MOV or WebM file, up to 20 MB." }, { status: 400 });
  const { requestId, fieldId, version } = parsed.data;
  const config = await getRefundForm(version);
  const field = config?.form.pages.flatMap(p => p.blocks).find(b => b.id === fieldId && b.type === "file");
  if (!field || !file.type.startsWith(`${field.accept}/`) || file.size > (field.maxMB ?? 20) * 1024 * 1024) return Response.json({ error: "invalid_file" }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  const error = await db.transaction(async tx => {
    // Serialize uploads per customer, bounding persistent storage across concurrent requests.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);
    // Expire abandoned uploads after seven days; files referenced by a submitted
    // form remain immutable and available to the review team.
    await tx.execute(sql`delete from refund_uploads u where u.user_id = ${user.id}
      and u.created_at < now() - interval '7 days'
      and not exists (select 1 from tickets t where t.user_id = u.user_id
        and t.client_request_id = u.request_id
        and t.refund_response -> 'answers' ->> u.field_id = u.id)
      and not exists (select 1 from refund_requests r where r.user_id = u.user_id
        and r.id = u.request_id and r.answers ->> u.field_id = u.id)`);
    const [usage] = await tx.select({ total: sql<number>`coalesce(sum(${refundUploads.size}),0)` }).from(refundUploads).where(and(eq(refundUploads.userId, user.id), sql`${refundUploads.createdAt} > now() - interval '24 hours'`));
    if (Number(usage.total) + file.size > 200 * 1024 * 1024) return "Daily upload limit reached. Please try again tomorrow or contact support.";
    const existing = await tx.query.tickets.findFirst({ where: and(eq(tickets.clientRequestId, requestId), eq(tickets.userId, user.id)) });
    if (existing) return "This request has already been submitted.";
    const draft = await tx.query.refundRequests.findFirst({ where: eq(refundRequests.id, requestId) });
    if (draft && draft.userId !== user.id) return "Invalid request.";
    await tx.insert(refundUploads).values({ id, userId: user.id, requestId, fieldId, name: file.name.slice(0,200), mime: file.type, size: file.size, dataBase64: bytes.toString("base64") });
    return null;
  });
  if (error) return Response.json({ error }, { status: 409 });
  return Response.json({ id, name: file.name });
});
