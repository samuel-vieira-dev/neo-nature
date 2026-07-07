import { runJobs } from "@/server/jobs";
import { sessionUserId, isDemoMode } from "@/server/session";

/**
 * Hourly job tick. Two ways in:
 *  - Railway cron:  POST /api/jobs/tick?key=$JOB_KEY
 *  - Demo panel:    POST by a signed-in user while DEMO_MODE=true
 */
export async function POST(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  const keyOk = !!process.env.JOB_KEY && key === process.env.JOB_KEY;
  const demoOk = isDemoMode() && (await sessionUserId()) !== null;

  if (!keyOk && !demoOk) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const actions = await runJobs();
    return Response.json({ ok: true, actions });
  } catch (e) {
    console.error("[jobs]", e);
    return Response.json({ error: "job_failure" }, { status: 500 });
  }
}
