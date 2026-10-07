import { withAdmin } from "@/server/admin";
import { listSupportEmails } from "@/server/support-email";
import { z } from "zod";

const filters = z.object({ limit: z.coerce.number().int().min(1).max(100).default(10), offset: z.coerce.number().int().min(0).default(0), q: z.string().max(200).optional(), tier: z.enum(["T1", "T2", "T3"]).optional(), owner: z.enum(["agent", "human"]).optional(), orderBy: z.enum(["created", "updated"]).default("updated"), direction: z.enum(["asc", "desc"]).default("desc") });
export const GET = withAdmin(async (_admin, request: Request) => {
  const parsed = filters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "invalid_filters" }, { status: 400 });
  return Response.json(await listSupportEmails(parsed.data));
}, "support:read");
