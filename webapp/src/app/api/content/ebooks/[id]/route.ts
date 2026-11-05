import { z } from "zod";
import { impersonatorId, withUser } from "@/server/session";
import { publishedEbook, saveEbookProgress } from "@/server/content-ebooks";
type Ctx = { params: Promise<{ id: string }> };
export const GET = withUser(async (user, _request: Request, ctx: Ctx) => {
  const found = await publishedEbook((await ctx.params).id, user.id);
  return found ? Response.json(found) : Response.json({ error: "not_found" }, { status: 404 });
});
const progressInput = z.object({ chapterId: z.string().min(1).max(100) }).strict();
/** Remembers the chapter the customer is on so the reader resumes there. Staff viewing as the customer leave no trace. */
export const PUT = withUser(async (user, request: Request, ctx: Ctx) => {
  const parsed = progressInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  if (!(await impersonatorId())) await saveEbookProgress(user.id, (await ctx.params).id, parsed.data.chapterId);
  return Response.json({ ok: true });
});
