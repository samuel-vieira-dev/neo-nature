/**
 * Fills orders.buygoods_account_id / orders.buygoods_user_id from the raw IPNs
 * in webhook_logs, for orders ingested before those columns existed.
 *
 * Every BuyGoods IPN carries user_id, and account_id is either a top-level
 * field or embedded in buy_url. Only the (account_id, user_id) PAIR is stored
 * — user_id ranges overlap across BuyGoods accounts (see schema.ts), so a log
 * that yields only one half contributes nothing.
 *
 * Only fills blanks — never overwrites what the ingest already wrote. If two
 * logs for the same order disagree on the pair, the order is flagged and
 * SKIPPED rather than guessing.
 *
 * Dry run by default — prints what it would do and changes nothing.
 *
 * Usage:
 *   npx tsx --env-file=.env.production scripts/backfill-order-bg-user.ts
 *   npx tsx --env-file=.env.production scripts/backfill-order-bg-user.ts --apply
 */
import { rawSql } from "../src/db";
import { parseIpnParams } from "../src/server/buygoods";

const apply = process.argv.includes("--apply");

async function main() {
  const logs = await rawSql<{ id: number; body: string; query: Record<string, string> }[]>`
    select id, body, query from webhook_logs where source = 'buygoods' order by id`;

  // order_id_global -> (account_id, user_id); conflicting pairs disqualify the order
  const pairs = new Map<string, { acct: string; uid: string }>();
  const conflicted = new Set<string>();
  for (const row of logs) {
    const p = parseIpnParams(row.query, row.body);
    const bgId = p.order_id_global?.trim();
    if (!bgId || /^TSTFWD/i.test(bgId)) continue;
    const acct = p.account_id?.trim() || p.buy_url?.match(/account_id(?:%253D|%3D|=)(\d+)/)?.[1];
    const uid = p.user_id?.trim();
    if (!acct || !uid) continue;
    const seen = pairs.get(bgId);
    if (seen && (seen.acct !== acct || seen.uid !== uid)) {
      conflicted.add(bgId);
      continue;
    }
    pairs.set(bgId, { acct, uid });
  }
  for (const c of conflicted) pairs.delete(c);
  console.log(`${pairs.size} order(s) with a consistent (account_id, user_id) pair in the logs`);
  if (conflicted.size) console.log(`  ${conflicted.size} conflicting order(s) skipped: ${[...conflicted].slice(0, 5).join(", ")}`);

  const blanks = await rawSql<{ buygoods_order_id: string }[]>`
    select buygoods_order_id from orders
    where source = 'buygoods' and buygoods_user_id is null and buygoods_order_id is not null`;
  const fillable = blanks.filter((b) => pairs.has(b.buygoods_order_id));
  console.log(`${blanks.length} order(s) missing the pair; ${fillable.length} recoverable from logs`);

  if (!apply) {
    for (const b of fillable.slice(0, 10)) {
      const p = pairs.get(b.buygoods_order_id)!;
      console.log(`  would set ${b.buygoods_order_id} -> account ${p.acct}, user ${p.uid}`);
    }
    console.log("\nre-run with --apply to write.");
    await rawSql.end();
    return;
  }

  let updated = 0;
  for (const b of fillable) {
    const p = pairs.get(b.buygoods_order_id)!;
    await rawSql`
      update orders set buygoods_account_id = ${p.acct}, buygoods_user_id = ${p.uid}
      where buygoods_order_id = ${b.buygoods_order_id} and buygoods_user_id is null`;
    updated++;
  }
  console.log(`\nupdated ${updated} order(s)`);

  const left = await rawSql<{ total: number }[]>`
    select count(*)::int as total from orders where source = 'buygoods' and buygoods_user_id is null`;
  console.log(`${left[0].total} buygoods order(s) still without the pair (no usable log)`);

  await rawSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
