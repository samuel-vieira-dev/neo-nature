import { withAdmin } from "@/server/admin";
import { getSupportStats } from "@/server/support-desk";

export const GET = withAdmin(async () => {
  return Response.json(await getSupportStats());
}, "customers:read");
