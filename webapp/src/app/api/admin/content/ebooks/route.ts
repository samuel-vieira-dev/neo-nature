import { withAdmin } from "@/server/admin";
import { readWebhookJson } from "@/server/support-email-contract";
import { ebookHistory, ebookInput, listEbooks, saveEbook } from "@/server/content-ebooks";
export const GET = withAdmin(async (_admin, request: Request) => {
  const id = new URL(request.url).searchParams.get("history");
  return Response.json(id ? { revisions: await ebookHistory(id) } : { ebooks: await listEbooks() });
}, "content:write");
export const POST = withAdmin(async (admin, request: Request) => {
  const parsed = ebookInput.safeParse(await readWebhookJson(request));
  if (!parsed.success) return Response.json({ error: "invalid_ebook" }, { status: 400 });
  return Response.json(await saveEbook(parsed.data, admin));
}, "content:write");
