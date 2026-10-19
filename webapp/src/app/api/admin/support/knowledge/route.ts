import { withAdmin } from "@/server/admin";
import { readWebhookJson } from "@/server/support-email-contract";
import { articleInput, knowledgeHistory, listKnowledge, saveKnowledge } from "@/server/support-knowledge";
export const GET = withAdmin(async (_admin, request: Request) => {
  const id = new URL(request.url).searchParams.get("history");
  return Response.json(id ? { revisions: await knowledgeHistory(id) } : { articles: await listKnowledge() });
}, "support:read");
export const POST = withAdmin(async (admin, request: Request) => {
  const parsed = articleInput.safeParse(await readWebhookJson(request));
  if (!parsed.success) return Response.json({ error: "invalid_article" }, { status: 400 });
  return Response.json(await saveKnowledge(parsed.data, admin));
}, "tickets:write");
