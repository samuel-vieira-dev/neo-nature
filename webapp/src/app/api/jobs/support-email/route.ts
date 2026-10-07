import { requireWebhookKey } from "@/server/support-email-contract";
import { runSupportEmailJobs } from "@/server/support-email";

export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    requireWebhookKey(request, process.env.SUPPORT_EMAIL_JOB_KEY);
    return Response.json(await runSupportEmailJobs());
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[support-email] Worker failed");
    return Response.json({ error: "worker_failed" }, { status: 503 });
  }
}
