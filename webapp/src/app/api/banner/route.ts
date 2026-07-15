import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { banners } from "@/db/schema";
import { withUser } from "@/server/session";

/** Returns the most recently created active banner (or null). */
export const GET = withUser(async () => {
  const banner = await db.query.banners.findFirst({
    where: eq(banners.active, true),
    orderBy: [desc(banners.createdAt)],
  });

  return Response.json({
    banner: banner
      ? { id: banner.id, title: banner.title, body: banner.body, ctaLabel: banner.ctaLabel, ctaUrl: banner.ctaUrl }
      : null,
  });
});
