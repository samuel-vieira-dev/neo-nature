/**
 * Adds the two `orders` columns the Konnektive ingest needs:
 *
 *   source              — which feed owns the row (buygoods | konnektive)
 *   konnektive_order_id — Konnektive's clientOrderId, the idempotency key
 *
 * Without them every Konnektive webhook fails with `column "source" does not
 * exist`; the endpoint still answers 200 and still captures the raw payload,
 * so nothing is lost, but no order reaches the app.
 *
 * Purely additive and idempotent (IF NOT EXISTS on all three statements), so
 * it is safe to re-run and safe against production:
 *   - `source` gets DEFAULT 'buygoods', which is correct for every existing
 *     row — they all came from the BuyGoods IPN.
 *   - `konnektive_order_id` starts entirely NULL, so the unique index can
 *     never collide.
 * The index name matches Drizzle's own convention (orders_buygoods_order_id_unique),
 * so a later `drizzle-kit push` sees no drift and won't try to recreate it.
 *
 * Usage:
 *   npx tsx --env-file=.env.local      scripts/add-konnektive-columns.ts
 *   npx tsx --env-file=.env.production scripts/add-konnektive-columns.ts
 */
import { rawSql } from "../src/db";

async function main() {
  await rawSql.begin(async (tx) => {
    await tx`alter table orders add column if not exists source text not null default 'buygoods'`;
    await tx`alter table orders add column if not exists konnektive_order_id text`;
    await tx`create unique index if not exists orders_konnektive_order_id_unique on orders (konnektive_order_id)`;
  });

  const cols = await rawSql`
    select column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name in ('source', 'konnektive_order_id')
    order by column_name`;
  console.log("columns now present:");
  for (const c of cols) {
    console.log(`  orders.${c.column_name}  ${c.data_type}  null=${c.is_nullable}  default=${c.column_default ?? "-"}`);
  }
  if (cols.length !== 2) throw new Error(`expected 2 columns, found ${cols.length}`);

  const bySource = await rawSql`select source, count(*)::int as n from orders group by source order by source`;
  console.log("orders by source:", bySource.map((r) => `${r.source}=${r.n}`).join(" "));

  await rawSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
