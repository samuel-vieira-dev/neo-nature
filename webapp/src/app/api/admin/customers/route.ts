import { withAdmin } from "@/server/admin";
import { hasPermission } from "@/server/permissions";
import { loadCustomers, applyFilters, computeStats, facets, type CustomerFilters } from "@/server/crm";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export const GET = withAdmin(async (admin, req: Request) => {
  const url = new URL(req.url);
  const rows = await loadCustomers();

  const status = url.searchParams.get("status");
  const filters: CustomerFilters = {
    origin: url.searchParams.get("origin") || undefined,
    platform: url.searchParams.get("platform") || undefined,
    product: url.searchParams.get("product") || undefined,
    status: status === "active" || status === "churned" ? status : undefined,
    reachable: url.searchParams.get("reachable") === "1",
    hasApp: url.searchParams.get("hasApp") === "1",
    q: url.searchParams.get("q") || undefined,
  };

  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get("limit") || "", 10) || DEFAULT_LIMIT));

  const filtered = applyFilters(rows, filters);
  return Response.json({
    // Revenue/dashboard stats are Admin-only (see plan §1); CS gets null and
    // the CRM page simply skips rendering the stat cards.
    stats: hasPermission(admin.role, "analytics:read") ? computeStats(rows) : null, // top-line stats are global (unfiltered)
    facets: facets(rows),
    filteredCount: filtered.length,
    customers: filtered.slice(offset, offset + limit),
    offset,
    limit,
  });
}, "customers:read");
