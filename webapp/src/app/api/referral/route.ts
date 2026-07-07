import { eq } from "drizzle-orm";
import { db } from "@/db";
import { referrals } from "@/db/schema";
import { withUser } from "@/server/session";
import { referralLeaderboardSeed } from "@/lib/data";

export const GET = withUser(async (user) => {
  let ref = await db.query.referrals.findFirst({ where: eq(referrals.userId, user.id) });
  if (!ref) {
    [ref] = await db
      .insert(referrals)
      .values({
        userId: user.id,
        code: `${user.name.slice(0, 6).toUpperCase()}${Math.floor(10 + Math.random() * 90)}`,
      })
      .returning();
  }

  const board = [...referralLeaderboardSeed, { name: `${user.name} (you)`, converted: ref.convertedCount }]
    .sort((a, b) => b.converted - a.converted)
    .map((row, i) => ({ rank: i + 1, ...row, you: row.name.endsWith("(you)") }));

  return Response.json({
    code: ref.code,
    invitedCount: ref.invitedCount,
    convertedCount: ref.convertedCount,
    pointsPerConversion: 500,
    leaderboard: board,
  });
});
