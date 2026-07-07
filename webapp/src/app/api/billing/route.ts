import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { withUser } from "@/server/session";
import { appNow, daysBetween } from "@/server/time";

export const GET = withUser(async (user) => {
  const rows = await db.query.invoices.findMany({
    where: eq(invoices.userId, user.id),
    orderBy: [desc(invoices.chargedAt)],
  });

  const now = appNow(user);
  const upcoming = rows.find((i) => i.status === "upcoming");

  return Response.json({
    upcoming: upcoming
      ? {
          id: upcoming.id,
          amount: Number(upcoming.amount),
          cardDescriptor: upcoming.cardDescriptor,
          chargedAt: upcoming.chargedAt,
          daysUntil: Math.max(0, daysBetween(now, upcoming.chargedAt)),
        }
      : null,
    invoices: rows.map((i) => ({
      id: i.id,
      amount: Number(i.amount),
      cardDescriptor: i.cardDescriptor,
      status: i.status,
      orderNumber: i.orderNumber,
      date: i.chargedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    })),
  });
});
