import { runJobs } from "@/server/jobs";

/**
 * Hourly retention job tick. Called by the Railway cron service:
 *   POST /api/jobs/tick?key=$JOB_KEY
 */
export async function POST(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!process.env.JOB_KEY || key !== process.env.JOB_KEY) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const actions = await runJobs();
    return Response.json({ ok: true, actions });
  } catch (e) {
    console.error("[jobs]", e);
    return Response.json({ error: "job_failure" }, { status: 500 });
  }
}
