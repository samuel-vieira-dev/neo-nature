/**
 * One-off backfill: BuyGoods embeds shipping_tracking_id in the full order
 * snapshot it sends on every postback (order/fulfillment/cancel/refund) —
 * not just a dedicated fulfillment event. We only started reading that field
 * recently, so orders that shipped before then never got it. Every raw
 * request is kept in webhook_logs, though, so we can recover it without
 * BuyGoods resending anything.
 *
 * For each buygoods webhook_logs row with a non-empty shipping_tracking_id,
 * updates the matching order (by order_id_global) if it doesn't have one yet
 * — using the most recent log per order, since the tracking id doesn't
 * change once fulfilled and later logs are least likely to be stale.
 *
 * Usage: npx tsx scripts/backfill-tracking.ts [--dry-run]
 */
import { asc, eq, sql } from "drizzle-orm";
import { db, rawSql } from "../src/db";
import { webhookLogs, orders } from "../src/db/schema";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const logs = await db.query.webhookLogs.findMany({
    where: sql`source = 'buygoods' and body like '%shipping_tracking_id=%'`,
    orderBy: [asc(webhookLogs.receivedAt)],
    columns: { body: true, receivedAt: true },
  });

  // last write wins per order — logs are sorted oldest-first above
  const trackingByOrder = new Map<string, string>();
  for (const log of logs) {
    const p = new URLSearchParams(log.body);
    const bgId = p.get("order_id_global")?.trim();
    const trackingId = p.get("shipping_tracking_id")?.trim();
    if (bgId && trackingId) trackingByOrder.set(bgId, trackingId);
  }

  console.log(`${logs.length} webhook_logs rows scanned, ${trackingByOrder.size} distinct orders with a tracking id`);

  let updated = 0;
  let alreadySet = 0;
  let notFound = 0;

  for (const [bgId, trackingId] of trackingByOrder) {
    const order = await db.query.orders.findFirst({
      where: eq(orders.buygoodsOrderId, bgId),
      columns: { id: true, shippingTrackingId: true },
    });
    if (!order) {
      notFound++;
      continue;
    }
    if (order.shippingTrackingId) {
      alreadySet++;
      continue;
    }
    console.log(`  ${bgId} -> ${trackingId}`);
    if (!dryRun) await db.update(orders).set({ shippingTrackingId: trackingId }).where(eq(orders.id, order.id));
    updated++;
  }

  console.log(`\n${dryRun ? "[dry run] would update" : "updated"}: ${updated}`);
  console.log(`already had a tracking id: ${alreadySet}`);
  console.log(`no matching order (order arrived after this log's retention, or never ingested): ${notFound}`);
}

main()
  .then(async () => {
    await rawSql.end();
  })
  .catch(async (e) => {
    console.error(e);
    await rawSql.end();
    process.exit(1);
  });
