/**
 * Re-runs the BuyGoods ingest over payloads already captured in webhook_logs.
 * Use after a fix that made past webhooks fail — the raw capture always
 * succeeded, so the orders can be recovered without asking anyone to resend.
 *
 * Written for the n8n relay switch (2026-08-15): the client's n8n started
 * POSTing events as JSON, which parseIpnParams didn't understand until the
 * same-day fix, so ~88 fulfillment events (tracking codes) were captured but
 * never applied to orders.
 *
 * Replays oldest-first, so an order's later lifecycle events land on top of
 * the sale that created it, exactly as live traffic would have arrived.
 *
 * Notifications are ALWAYS suppressed here (ingest runs with isReplay): these
 * are historical events, and a customer must not be pushed "your order
 * shipped" out of band.
 *
 * TSTFWD* order ids (n8n workflow test pings, fake @mailinator.com customers)
 * are skipped — unlike BuyGoods is_test purchases, they don't exist in the CRM.
 *
 * Dry run by default — prints what it would do and changes nothing.
 *
 * Usage:
 *   npx tsx --env-file=.env.production scripts/replay-buygoods-logs.ts
 *   npx tsx --env-file=.env.production scripts/replay-buygoods-logs.ts --apply
 *   ...  --since=2026-08-15     only logs received on/after this date
 *   ...  --json-only            only JSON bodies (the n8n relay shape)
 *   ...  --limit=50             cap how many logs are processed
 */
import { rawSql } from "../src/db";
import { parseIpnParams, ingestBuyGoodsEvent } from "../src/server/buygoods";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const apply = process.argv.includes("--apply");
const jsonOnly = process.argv.includes("--json-only");
const since = arg("since");
const limit = Math.max(1, parseInt(arg("limit") ?? "10000", 10) || 10000);

type LogRow = { id: number; body: string; query: Record<string, string>; received_at: Date };

async function main() {
  const rows: LogRow[] = since
    ? await rawSql`select id, body, query, received_at from webhook_logs
        where source = 'buygoods' and received_at >= ${since}
        order by received_at asc limit ${limit}`
    : await rawSql`select id, body, query, received_at from webhook_logs
        where source = 'buygoods'
        order by received_at asc limit ${limit}`;

  const selected = jsonOnly ? rows.filter((r) => r.body.trim().startsWith("{")) : rows;
  console.log(`${selected.length} captured log(s)${apply ? "" : " — DRY RUN, nothing will be written"}\n`);

  const tally = { created: 0, updated: 0, skipped: 0, failed: 0 };

  for (const row of selected) {
    const params = parseIpnParams(row.query, row.body);
    const bgId = params.order_id_global?.trim();
    if (!bgId) {
      tally.skipped++;
      console.log(`  log ${row.id}: no order_id_global — skipped`);
      continue;
    }
    if (/^TSTFWD/i.test(bgId)) {
      tally.skipped++;
      console.log(`  log ${row.id}: ${bgId} is an n8n test ping — skipped`);
      continue;
    }

    if (!apply) {
      console.log(
        `  would ingest ${bgId} (${params.action_type || params.type || "?"}${
          params.shipping_tracking_id ? `, tracking ${params.shipping_tracking_id}` : ""
        })`
      );
      continue;
    }

    try {
      const result = await ingestBuyGoodsEvent(params, row.query.event, { isReplay: true });
      if (result.ok) {
        tally[result.status]++;
        console.log(`  ${result.status} ${result.orderId}`);
      } else {
        tally.failed++;
        console.log(`  failed ${bgId}: ${result.reason}`);
      }
    } catch (e) {
      tally.failed++;
      console.log(`  failed ${bgId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\nsummary:", JSON.stringify(tally));
  if (!apply) console.log("\nre-run with --apply to write.");

  await rawSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
