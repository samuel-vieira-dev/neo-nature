import { withAdmin } from "@/server/admin";
import { getOrdersDesk } from "@/server/support-desk";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const GET = withAdmin(async (_admin, req: Request) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const problemRaw = url.searchParams.get("problem");
  const problem =
    problemRaw === "awaiting" || problemRaw === "refund" || problemRaw === "chargeback" ? problemRaw : undefined;
  const q = url.searchParams.get("q") || undefined;
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get("limit") || "", 10) || DEFAULT_LIMIT));

  return Response.json(await getOrdersDesk({ status, problem, q, offset, limit }));
}, "customers:read");
