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
  const excludeStatusRaw = url.searchParams.get("excludeStatus") || undefined;
  const excludeStatus = excludeStatusRaw ? excludeStatusRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const limit = Number(url.searchParams.get("limit") ?? 10);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const orderBy = url.searchParams.get("orderBy") ?? "updated";
  const direction = url.searchParams.get("direction") ?? "desc";
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1000 || !["created", "updated"].includes(orderBy) || !["asc", "desc"].includes(direction) || [updatedFrom, updatedTo].some(date => date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())))) return Response.json({ error: "invalid_pagination_or_dates" }, { status: 400 });
  return Response.json(await getTicketQueue({ status, q, kind, priority, updatedFrom, updatedTo, excludeStatus, limit, offset, orderBy: orderBy as "created" | "updated", direction: direction as "asc" | "desc" }));
}, "support:read");
