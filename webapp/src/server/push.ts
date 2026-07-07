import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions, notifications } from "@/db/schema";

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:support@neonature.app", pub, priv);
  configured = true;
  return true;
}

/**
 * Creates an in-app notification AND sends a real web push to every browser
 * the user subscribed. Dead subscriptions are pruned automatically.
 */
export async function notifyUser(
  userId: string,
  payload: { title: string; body: string; icon?: "flame" | "package" | "book" | "tag"; url?: string }
): Promise<void> {
  await db.insert(notifications).values({
    userId,
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "flame",
  });

  if (!configure()) return;

  const subs = await db.query.pushSubscriptions.findMany({
    where: eq(pushSubscriptions.userId, userId),
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? "/" })
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        }
      }
    })
  );
}
