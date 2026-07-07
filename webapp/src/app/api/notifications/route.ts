import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { withUser } from "@/server/session";
import { appNow, isoDay } from "@/server/time";

export const GET = withUser(async (user) => {
  const rows = await db.query.notifications.findMany({
    where: eq(notifications.userId, user.id),
    orderBy: [desc(notifications.createdAt)],
    limit: 50,
  });

  const today = isoDay(appNow(user));
  const list = rows.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    icon: n.icon,
    read: !!n.readAt,
    group: isoDay(n.createdAt) === today ? "today" : "earlier",
    time:
      isoDay(n.createdAt) === today
        ? n.createdAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        : n.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  return Response.json({ notifications: list });
});
