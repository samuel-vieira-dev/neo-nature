import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pointsLedger, users } from "@/db/schema";
import { withUser } from "@/server/session";
import { appNow } from "@/server/time";
import { pointsBalance } from "@/server/domain";
import { notifyUser } from "@/server/push";
import { rewardById } from "@/lib/data";

export const GET = withUser(async (user) => {
  const ledger = await db.query.pointsLedger.findMany({
    where: eq(pointsLedger.userId, user.id),
    orderBy: [desc(pointsLedger.createdAt)],
  });
  const balance = pointsBalance(ledger, appNow(user));
  return Response.json({
    balance,
    ledger: ledger.slice(0, 10).map((e) => ({
      id: e.id,
      delta: e.delta,
      reason: e.reason,
      expiresAt: e.expiresAt,
      createdAt: e.createdAt,
    })),
  });
});

const redeemSchema = z.object({ rewardId: z.string() });

export const POST = withUser(async (user, request: Request) => {
  const parsed = redeemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const reward = rewardById(parsed.data.rewardId);
  if (!reward) return Response.json({ error: "unknown_reward" }, { status: 404 });

  const ledger = await db.query.pointsLedger.findMany({ where: eq(pointsLedger.userId, user.id) });
  const { total } = pointsBalance(ledger, appNow(user));
  if (total < reward.cost) return Response.json({ error: "insufficient_points" }, { status: 400 });

  await db.insert(pointsLedger).values({
    userId: user.id,
    delta: -reward.cost,
    reason: `Redeemed: ${reward.name}`,
  });

  if (reward.kind === "freeze") {
    await db.update(users).set({ freezes: user.freezes + 3 }).where(eq(users.id, user.id));
  }

  await notifyUser(user.id, {
    title: `${reward.emoji} ${reward.name} redeemed!`,
    body:
      reward.kind === "freeze"
        ? "3 streak freezes added to your account — busy weeks can't touch you now."
        : `${reward.detail}. Our team will apply it to your account within 24h.`,
    icon: "tag",
    url: "/rewards",
  });

  return Response.json({ ok: true });
});
