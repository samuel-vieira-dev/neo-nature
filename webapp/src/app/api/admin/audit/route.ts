import { desc } from "drizzle-orm";
import { db } from "@/db";
import { adminActionLogs } from "@/db/schema";
import { withAdmin } from "@/server/admin";

// Every admin write goes through logAdminAction (src/server/admin.ts), so
// this is the single place staff can see "who did what". admin_user_id has no
// FK — rows from before individual accounts existed (the old shared
// ADMIN_PASSWORD login) point at ids with no admin_users match; those are
// labeled "legacy shared account" rather than dropped, so old history stays
// visible.

export const GET = withAdmin(async () => {
  const logs = await db.query.adminActionLogs.findMany({
    orderBy: [desc(adminActionLogs.createdAt)],
    limit: 200,
  });
  const admins = await db.query.adminUsers.findMany();
  const byId = new Map(admins.map((a) => [a.id, a]));

  const rows = logs.map((l) => {
    const author = byId.get(l.adminUserId);
    return {
      id: l.id,
      createdAt: l.createdAt,
      action: l.action,
      targetUserId: l.targetUserId,
      metadata: l.metadata,
      adminName: author ? author.name || author.email : "legacy shared account",
      adminEmail: author?.email ?? null,
    };
  });

  return Response.json({ logs: rows });
}, "admins:manage");
