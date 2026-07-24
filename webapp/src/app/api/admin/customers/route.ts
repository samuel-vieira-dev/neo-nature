import { withAdmin } from "@/server/admin";
import { loadCustomers, applyFilters, computeStats, facets, type CustomerFilters } from "@/server/crm";

export const GET = withAdmin(async (_admin, req: Request) => {
  const url = new URL(req.url);
  const rows = await loadCustomers();

  const status = url.searchParams.get("status");
  const filters: CustomerFilters = {
    origin: url.searchParams.get("origin") || undefined,
    product: url.searchParams.get("product") || undefined,
    status: status === "active" || status === "churned" ? status : undefined,
    reachable: url.searchParams.get("reachable") === "1",
    hasApp: url.searchParams.get("hasApp") === "1",
    q: url.searchParams.get("q") || undefined,
  };

  const filtered = applyFilters(rows, filters);
  return Response.json({
    stats: computeStats(rows), // top-line stats are global (unfiltered)
    facets: facets(rows),
    filteredCount: filtered.length,
    customers: filtered.slice(0, 500),
  });
});
