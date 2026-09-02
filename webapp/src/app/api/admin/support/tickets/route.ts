import { withAdmin } from "@/server/admin";
import { getTicketQueue } from "@/server/support-desk";

export const GET = withAdmin(async (_admin, req: Request) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const q = url.searchParams.get("q") || undefined;
  return Response.json(await getTicketQueue({ status, q }));
}, "customers:read");
