import { emailInboundSchema, readWebhookJson, requireWebhookKey } from "@/server/support-email-contract";
import { receiveSupportEmail } from "@/server/support-email";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireWebhookKey(request, process.env.SUPPORT_EMAIL_INBOUND_API_KEY);
    const parsed = emailInboundSchema.safeParse(await readWebhookJson(request));
    if (!parsed.success) return Response.json({ error: "invalid_email_payload", fields: parsed.error.issues.map(i => i.path.join(".")) }, { status: 400 });
    return Response.json(await receiveSupportEmail(parsed.data), { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[support-email] Could not persist inbound email");
    return Response.json({ error: "email_persistence_failed" }, { status: 503 });
  }
}
