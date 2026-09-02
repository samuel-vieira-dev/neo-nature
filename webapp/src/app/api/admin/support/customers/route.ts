import { withAdmin } from "@/server/admin";
import { searchCustomersDesk } from "@/server/support-desk";

export const GET = withAdmin(async (_admin, req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || undefined;
  return Response.json({ customers: await searchCustomersDesk(q) });
}, "customers:read");
