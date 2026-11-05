import { logAdminAction, withAdmin } from "@/server/admin";
import { getSupportReport } from "@/server/support-reports";
import { reportRangeFrom } from "@/server/support-report-range";
import { supportReportCsv } from "@/lib/support-report";

export const GET = withAdmin(async (admin, req: Request) => {
  const range = reportRangeFrom(req.url);
  const report = await getSupportReport(range);
  await logAdminAction(admin, "support-reports.export", { metadata: { ...range, tickets: report.tickets.length } });
  return new Response(`﻿${supportReportCsv(report.tickets)}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="support-report-${range.from}-to-${range.to}.csv"`, "Cache-Control": "no-store" },
  });
}, "reports:export");
