import { desc } from "drizzle-orm";
import { db } from "@/db";
import { webhookLogs } from "@/db/schema";
import { withUser } from "@/server/session";

/** Authenticated viewer for captured BuyGoods test payloads (see /webhook-buygoods-info). */
export const GET = withUser(async () => {
  const rows = await db.query.webhookLogs.findMany({
    orderBy: [desc(webhookLogs.receivedAt)],
    limit: 50,
  });
  return Response.json({ logs: rows });
});
