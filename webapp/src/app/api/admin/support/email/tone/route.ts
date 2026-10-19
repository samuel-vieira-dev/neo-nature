import { withAdmin } from "@/server/admin";
import { readWebhookJson } from "@/server/support-email-contract";
import { readSupportEmailTone, saveSupportEmailTone, toneInputSchema } from "@/server/support-email-tone";

export const GET = withAdmin(async () => Response.json(await readSupportEmailTone()), "support:read");
export const PUT = withAdmin(async (admin, request: Request) => {
  const parsed = toneInputSchema.safeParse(await readWebhookJson(request));
  if (!parsed.success) return Response.json({ error: "invalid_tone_instructions" }, { status: 400 });
  return Response.json(await saveSupportEmailTone(parsed.data, admin));
}, "tickets:write");
