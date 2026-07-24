import { z } from "zod";
import { withAdmin } from "@/server/admin";
import { loadCustomers, applyFilters, type CustomerFilters } from "@/server/crm";
import { notifyUser } from "@/server/push";

const schema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(300),
  url: z.string().max(200).optional(),
  filters: z
    .object({
      origin: z.string().optional(),
      product: z.string().optional(),
      status: z.enum(["active", "churned", "all"]).optional(),
      reachable: z.boolean().optional(),
      hasApp: z.boolean().optional(),
      q: z.string().optional(),
    })
    .default({}),
});

// Sends a push campaign to the reachable customers matching the given filters.
export const POST = withAdmin(async (_admin, req: Request) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const { title, body, url } = parsed.data;
  const filters: CustomerFilters = { ...parsed.data.filters, reachable: true }; // only reachable

  const rows = await loadCustomers();
  const audience = applyFilters(rows, filters).filter((r) => r.userId);

  let sent = 0;
  for (const r of audience) {
    try {
      await notifyUser(r.userId!, { title, body, icon: "tag", url: url || "/" });
      sent++;
    } catch (e) {
      console.error("[admin-push] failed for", r.email, e);
    }
  }

  return Response.json({ ok: true, targeted: audience.length, sent });
});
