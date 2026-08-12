/**
 * Re-runs the Konnektive ingest over payloads already captured in
 * webhook_logs. Use after a fix that made past webhooks fail — the raw capture
 * always succeeded, so the orders can be recovered without asking the client to
 * resend anything.
 *
 * Written for the `column "source" does not exist` outage: the ingest ran
 * before scripts/add-konnektive-columns.ts had been applied, so every order
 * bounced while the endpoint still answered 200 (and Konnektive therefore never
 * retried).
 *
 * Replays oldest-first, so an order's later lifecycle events (UPSELL,
 * FULFILLMENT) land on top of the sale that created it, exactly as live traffic
 * would have arrived.
 *
 * Notifications are ALWAYS suppressed here regardless of what the payload says:
 * these are historical events, and a customer must not be pushed "your order
 * shipped" for a parcel that arrived last week.
 *
 * Dry run by default — prints what it would do and changes nothing.
 *
 * Usage:
 *   npx tsx --env-file=.env.production scripts/replay-konnektive-logs.ts
 *   npx tsx --env-file=.env.production scripts/replay-konnektive-logs.ts --apply
 *   ...  --since=2026-08-04     only logs received on/after this date
 *   ...  --limit=50             cap how many logs are processed
 */
import { rawSql } from "../src/db";
import { normalize } from "../src/server/konnektive-parse";
import { ingestKonnektiveOrder } from "../src/server/konnektive";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const apply = process.argv.includes("--apply");
const since = arg("since");
const limit = Math.max(1, parseInt(arg("limit") ?? "10000", 10) || 10000);

type LogRow = { id: number; body: string; headers: Record<string, string>; received_at: Date };

async function main() {
  const rows: LogRow[] = since
    ? await rawSql`select id, body, headers, received_at from webhook_logs
        where source = 'konnektive' and received_at >= ${since}
        order by received_at asc limit ${limit}`
    : await rawSql`select id, body, headers, received_at from webhook_logs
        where source = 'konnektive'
        order by received_at asc limit ${limit}`;

  console.log(`${rows.length} captured log(s)${apply ? "" : " — DRY RUN, nothing will be written"}\n`);

  const tally = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const skipReasons = new Map<string, number>();

  for (const row of rows) {
    let payload: unknown;
    try {
      payload = JSON.parse(row.body);
    } catch {
      tally.failed++;
      console.log(`  log ${row.id}: body is not JSON`);
      continue;
    }

    const parsed = normalize(payload, { replayHeader: true });
    if (!parsed.ok) {
      tally.skipped++;
      const key = parsed.reason.replace(/\(([^)]+)\)/, "(…)"); // group by reason, not by order id
      skipReasons.set(key, (skipReasons.get(key) ?? 0) + 1);
      continue;
    }

    // Historical by definition — never notify, whatever the payload claims.
    const order = { ...parsed.order, isReplay: true };

    if (!apply) {
      console.log(`  would ingest ${order.clientOrderId} (order ${order.number}, ${order.status}, ${order.total} ${order.currency})`);
      continue;
    }

    try {
      const result = await ingestKonnektiveOrder(order);
      if (result.ok) {
        tally[result.status]++;
        console.log(`  ${result.status} ${result.orderId}`);
      } else {
        tally.failed++;
        console.log(`  failed ${order.clientOrderId}: ${result.reason}`);
      }
    } catch (e) {
      tally.failed++;
      console.log(`  failed ${order.clientOrderId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\nsummary:", JSON.stringify(tally));
  if (skipReasons.size > 0) {
    console.log("skipped:");
    for (const [reason, n] of [...skipReasons].sort((a, b) => b[1] - a[1])) console.log(`  ${n}x ${reason}`);
  }
  if (!apply) console.log("\nre-run with --apply to write.");

  await rawSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
