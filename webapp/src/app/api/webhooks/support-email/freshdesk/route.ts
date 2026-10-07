import { freshdeskEmailEventSchema, readWebhookJson, requireWebhookKey } from "@/server/support-email-contract";
import { receiveFreshdeskEmailEvent } from "@/server/support-email";

export async function POST(request: Request) {
  try {
    requireWebhookKey(request, process.env.SUPPORT_EMAIL_FRESHDESK_WEBHOOK_API_KEY);
    const parsed = freshdeskEmailEventSchema.safeParse(await readWebhookJson(request));
    if (!parsed.success) return Response.json({ error: "invalid_freshdesk_payload" }, { status: 400 });
    return Response.json(await receiveFreshdeskEmailEvent(parsed.data));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[support-email] Could not persist human event");
    return Response.json({ error: "event_persistence_failed" }, { status: 503 });
  }
}
