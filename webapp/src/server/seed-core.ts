/* Production seed — only seeds a default communication banner. Real users,
 * orders, tickets and notifications are created at runtime (signup, BuyGoods
 * webhook, support flow, jobs). The admin panel will manage banners later. */
import { db, rawSql as sql } from "@/db";
import * as s from "@/db/schema";

export async function seedAll() {
  // Seed one active banner if none exists (don't clobber an admin-set one).
  const existing = await db.query.banners.findFirst();
  if (!existing) {
    await sql`INSERT INTO banners (title, body, cta_label, cta_url, active)
      VALUES ('Welcome to Neo Nature 🌿', 'Track your orders, build your daily streak, and get support — all in one place.', 'Get started', '/', true)`;
    console.log("[seed] inserted default banner");
  } else {
    console.log("[seed] banner already present — nothing to do");
  }
}
