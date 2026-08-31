import { withAdmin } from "@/server/admin";
import { loadCustomer } from "@/server/customer360";

export const GET = withAdmin(async (_admin, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  // ?freshdesk=0 skips the live Freshdesk lookup (used by callers that only
  // need the local data — e.g. the future AI context fetch).
  const customer = await loadCustomer(id, { freshdesk: url.searchParams.get("freshdesk") !== "0" });
  if (!customer) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ customer });
});
