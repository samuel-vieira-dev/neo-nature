import { withUser, isDemoMode } from "@/server/session";
import { seedAll } from "@/server/seed-core";

/** Demo panel: full reset of all personas back to their scenario baselines */
export const POST = withUser(async () => {
  if (!isDemoMode()) return Response.json({ error: "not_available" }, { status: 403 });
  await seedAll();
  return Response.json({ ok: true });
});
