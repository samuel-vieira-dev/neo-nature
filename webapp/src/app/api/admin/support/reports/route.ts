import { withAdmin } from "@/server/admin";
import { getAiQuestionsReport, getSupportReport } from "@/server/support-reports";
import { reportRangeFrom } from "@/server/support-report-range";

export const GET = withAdmin(async (_admin, req: Request) => {
  const range = reportRangeFrom(req.url);
  const [report, aiQuestions] = await Promise.all([getSupportReport(range), getAiQuestionsReport(range)]);
  // The per-ticket list is only for the CSV export; the page shows the breaches.
  return Response.json({ range, ...report, tickets: undefined, aiQuestions });
}, "reports:read");
