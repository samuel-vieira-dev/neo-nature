import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookLogs } from "@/db/schema";
import { withUser } from "@/server/session";

/** Authenticated viewer for captured Konnektive payloads (see /webhook-konnektive). */
export const GET = withUser(async () => {
  const rows = await db.query.webhookLogs.findMany({
    where: eq(webhookLogs.source, "konnektive"),
    orderBy: [desc(webhookLogs.receivedAt)],
    limit: 50,
  });
  return Response.json({ logs: rows });
});
