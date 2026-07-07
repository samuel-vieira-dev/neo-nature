import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { subscriptions, invoices } from "@/db/schema";
import { withUser } from "@/server/session";
import { appNow, addDays, isoDay } from "@/server/time";
import { notifyUser } from "@/server/push";
import { productById } from "@/lib/data";

export const GET = withUser(async (user) => {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, user.id),
    orderBy: [desc(subscriptions.id)],
  });
  if (!sub) return Response.json({ subscription: null });

  // "Complete your protocol": 90 days = 3 orders (first order + renewals)
  const ordersToward = Math.min(3, sub.monthsActive + 1);

  return Response.json({
    subscription: {
      id: sub.id,
      refId: sub.refId,
      status: sub.status,
      priceMonthly: Number(sub.priceMonthly),
      discountPct: sub.discountPct,
      nextBillingAt: sub.nextBillingAt,
      monthsActive: sub.monthsActive,
      skipsUsed: sub.skipsUsed,
      pausedUntil: sub.pausedUntil,
      startedAt: sub.startedAt,
      journey: { ordersToward, target: 3, completed: ordersToward >= 3 },
    },
  });
});

const actionSchema = z.object({
  action: z.enum(["pause", "resume", "skip", "swap", "cancel", "reactivate"]),
  productId: z.string().optional(),
});

export const POST = withUser(async (user, request: Request) => {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, user.id),
    orderBy: [desc(subscriptions.id)],
  });
  if (!sub) return Response.json({ error: "no_subscription" }, { status: 404 });

  const now = appNow(user);
  const { action, productId } = parsed.data;

  switch (action) {
    case "pause": {
      const until = addDays(now, 30);
      await db
        .update(subscriptions)
        .set({
          status: "paused",
          pausedUntil: until,
          nextBillingAt: sub.nextBillingAt ? addDays(sub.nextBillingAt, 30) : addDays(now, 30),
        })
        .where(eq(subscriptions.id, sub.id));
      await notifyUser(user.id, {
        title: "Subscription paused ⏸️",
        body: `No charges until ${isoDay(until)}. Your streak, points and tier are all safe.`,
        icon: "tag",
        url: "/subscription",
      });
      break;
    }
    case "resume":
    case "reactivate": {
      await db
        .update(subscriptions)
        .set({
          status: "active",
          pausedUntil: null,
          canceledAt: null,
          nextBillingAt: sub.nextBillingAt && sub.nextBillingAt > now ? sub.nextBillingAt : addDays(now, 30),
        })
        .where(eq(subscriptions.id, sub.id));
      await notifyUser(user.id, {
        title: "Welcome back! 💚",
        body: "Your subscription is active again — member pricing and perks restored.",
        icon: "tag",
        url: "/subscription",
      });
      break;
    }
    case "skip": {
      if (!sub.nextBillingAt) return Response.json({ error: "nothing_to_skip" }, { status: 400 });
      const next = addDays(sub.nextBillingAt, 30);
      await db
        .update(subscriptions)
        .set({ skipsUsed: sub.skipsUsed + 1, nextBillingAt: next })
        .where(eq(subscriptions.id, sub.id));
      await db
        .update(invoices)
        .set({ chargedAt: next })
        .where(and(eq(invoices.subscriptionId, sub.id), eq(invoices.status, "upcoming")));
      await notifyUser(user.id, {
        title: "Next delivery skipped ⏭️",
        body: `No charge this cycle — your next renewal is ${isoDay(next)}.`,
        icon: "tag",
        url: "/subscription",
      });
      break;
    }
    case "swap": {
      const product = productId ? productById(productId) : null;
      if (!product) return Response.json({ error: "unknown_product" }, { status: 400 });
      const newPrice = (product.price * (1 - sub.discountPct / 100)).toFixed(2);
      await db
        .update(subscriptions)
        .set({ refId: product.id, priceMonthly: newPrice })
        .where(eq(subscriptions.id, sub.id));
      await db
        .update(invoices)
        .set({ amount: newPrice, cardDescriptor: `NEONATURE*${product.name.toUpperCase()} 855-201-4437` })
        .where(and(eq(invoices.subscriptionId, sub.id), eq(invoices.status, "upcoming")));
      await notifyUser(user.id, {
        title: "Product swapped 🔄",
        body: `Your next delivery is ${product.name} at $${newPrice}/mo — same member discount.`,
        icon: "tag",
        url: "/subscription",
      });
      break;
    }
    case "cancel": {
      await db
        .update(subscriptions)
        .set({ status: "canceled", canceledAt: now, nextBillingAt: null })
        .where(eq(subscriptions.id, sub.id));
      await db
        .delete(invoices)
        .where(and(eq(invoices.subscriptionId, sub.id), eq(invoices.status, "upcoming")));
      await notifyUser(user.id, {
        title: "Subscription canceled",
        body: "No further charges — ever. You can reactivate any time with one tap, and your points stay put.",
        icon: "tag",
        url: "/subscription",
      });
      break;
    }
  }

  return Response.json({ ok: true });
});
