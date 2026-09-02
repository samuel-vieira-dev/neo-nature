import { withAdmin } from "@/server/admin";
import { getTicketQueue, type TicketQueueFilters } from "@/server/support-desk";

export const GET = withAdmin(async (_admin, req: Request) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const q = url.searchParams.get("q") || undefined;
  const kind = (url.searchParams.get("kind") || undefined) as TicketQueueFilters["kind"];
  const priority = url.searchParams.get("priority") || undefined;
  const updatedFrom = url.searchParams.get("updatedFrom") || undefined;
  const updatedTo = url.searchParams.get("updatedTo") || undefined;
  return Response.json(await getTicketQueue({ status, q, kind, priority, updatedFrom, updatedTo }));
}, "customers:read");
