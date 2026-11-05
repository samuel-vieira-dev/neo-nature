import { withAdmin } from "@/server/admin";
import { readWebhookJson } from "@/server/support-email-contract";
import { arrangeInput, arrangeKnowledge } from "@/server/support-knowledge";
export const POST = withAdmin(async (admin, request: Request) => {
  const parsed = arrangeInput.safeParse(await readWebhookJson(request));
  if (!parsed.success) return Response.json({ error: "invalid_arrangement" }, { status: 400 });
  return Response.json(await arrangeKnowledge(parsed.data, admin));
}, "tickets:write");
