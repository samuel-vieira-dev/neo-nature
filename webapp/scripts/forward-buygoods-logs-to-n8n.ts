/**
 * Re-sends historical BuyGoods IPNs (already captured in webhook_logs) through
 * classify + forward to the client's n8n webhooks — for backfilling events
 * that were captured before the n8n fan-out (src/server/n8n-forward.ts)
 * existed, or re-sending a batch n8n never received because it was down.
 *
 * Mirrors scripts/replay-buygoods-logs.ts: oldest-first, dry run by default,
 * TSTFWD* test order ids skipped (they're n8n's own workflow test pings, not
 * real orders — see classifyBuyGoodsEvent).
 *
 * forwardToN8n() defaults to disabled outside NODE_ENV=production (see
 * isN8nForwardEnabled in src/server/n8n-forward.ts) — --apply forces it on
 * for this process only, since a deliberate backfill run IS the case where a
 * human wants real network calls to n8n, whatever NODE_ENV happens to be.
 *
 * DO NOT run this against production n8n data without the client's sign-off:
 * it will make n8n's automations (order/refund/chargeback workflows) fire
 * again for old events. Point DATABASE_URL at prod only when a real backfill
 * has been agreed, and consider --limit on a first pass.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/forward-buygoods-logs-to-n8n.ts
 *   npx tsx --env-file=.env.local scripts/forward-buygoods-logs-to-n8n.ts --apply
 *   ...  --since=2026-08-15     only logs received on/after this date
 *   ...  --limit=50             cap how many logs are processed
 */
import { rawSql } from "../src/db";
import { parseIpnParams } from "../src/server/buygoods";
import { classifyBuyGoodsEvent, forwardToN8n } from "../src/server/n8n-forward";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const apply = process.argv.includes("--apply");
const since = arg("since");
const limit = Math.max(1, parseInt(arg("limit") ?? "10000", 10) || 10000);

// A deliberate backfill run is exactly the case where real network calls to
// n8n are wanted — override whatever the ambient NODE_ENV/N8N_FORWARD_ENABLED
// would otherwise decide, but only when --apply was actually passed.
if (apply) process.env.N8N_FORWARD_ENABLED = "true";

type LogRow = {
  id: number;
  body: string;
  query: Record<string, string>;
  content_type: string | null;
  method: string;
  received_at: Date;
};

async function main() {
  const rows: LogRow[] = since
    ? await rawSql`select id, body, query, content_type, method, received_at from webhook_logs
        where source = 'buygoods' and received_at >= ${since}
        order by received_at asc limit ${limit}`
    : await rawSql`select id, body, query, content_type, method, received_at from webhook_logs
        where source = 'buygoods'
        order by received_at asc limit ${limit}`;

  console.log(`${rows.length} captured log(s)${apply ? "" : " — DRY RUN, nothing will be sent"}\n`);

  const tally = { orders: 0, refunds: 0, chargebacks: 0, skipped: 0, failed: 0 };

  for (const row of rows) {
    const params = parseIpnParams(row.query, row.body);
    const bgId = params.order_id_global?.trim();
    const target = classifyBuyGoodsEvent(params, row.query.event);

    if (!target) {
      tally.skipped++;
      console.log(`  log ${row.id}: ${bgId ? `${bgId} — test/no-op` : "no order_id_global"} — skipped`);
      continue;
    }

    if (!apply) {
      console.log(`  would forward ${bgId} → ${target} (${params.action_type || params.type || "?"})`);
      tally[target]++;
      continue;
    }

    try {
      await forwardToN8n(target, params, {
        receivedAt: row.received_at.toISOString(),
        eventTag: row.query.event,
        contentType: row.content_type,
        method: row.method,
        rawBody: row.body,
      });
      tally[target]++;
      console.log(`  forwarded ${bgId} → ${target}`);
    } catch (e) {
      // forwardToN8n already swallows its own errors — this only catches a
      // genuinely unexpected throw (e.g. classify/param bug), not network failures.
      tally.failed++;
      console.log(`  failed ${bgId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\nsummary:", JSON.stringify(tally));
  if (!apply) console.log("\nre-run with --apply to actually send.");

  await rawSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
