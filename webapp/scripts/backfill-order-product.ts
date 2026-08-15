/**
 * Fills orders.product_name / orders.product_codename from the order's first
 * order_items row, for orders ingested before those columns existed.
 *
 * The columns are a denormalization of order_items (see schema.ts): BuyGoods
 * orders are single-product, and a multi-item Konnektive order records its
 * first line, so order_items remains the source of truth for full contents.
 *
 * Only fills blanks — never overwrites a value the ingest already wrote.
 *
 * Dry run by default — prints what it would do and changes nothing.
 *
 * Usage:
 *   npx tsx --env-file=.env.production scripts/backfill-order-product.ts
 *   npx tsx --env-file=.env.production scripts/backfill-order-product.ts --apply
 */
import { rawSql } from "../src/db";

const apply = process.argv.includes("--apply");

async function main() {
  const pending = await rawSql<{ total: number }[]>`
    select count(*)::int as total from orders where product_name = '' or product_codename = ''`;
  const missingItems = await rawSql<{ total: number }[]>`
    select count(*)::int as total from orders o
    where (o.product_name = '' or o.product_codename = '')
      and not exists (select 1 from order_items i where i.order_id = o.id)`;

  console.log(`${pending[0].total} order(s) with a blank product field`);
  console.log(`  ${missingItems[0].total} of them have no order_items row to copy from (will stay blank)`);

  if (!apply) {
    const sample = await rawSql`
      select o.id, i.product_name, i.product_codename
      from orders o
      join lateral (
        select product_name, product_codename from order_items where order_id = o.id order by id limit 1
      ) i on true
      where o.product_name = '' or o.product_codename = ''
      limit 10`;
    console.log("\nsample of what would be written:");
    for (const r of sample) console.log(`  ${r.id} -> ${JSON.stringify(r.product_name)} / ${JSON.stringify(r.product_codename)}`);
    console.log("\nre-run with --apply to write.");
    await rawSql.end();
    return;
  }

  // Single statement: pick each order's first line and fill only the blanks.
  const updated = await rawSql`
    update orders o
    set product_name = case when o.product_name = '' then i.product_name else o.product_name end,
        product_codename = case when o.product_codename = '' then i.product_codename else o.product_codename end
    from (
      select distinct on (order_id) order_id, product_name, product_codename
      from order_items order by order_id, id
    ) i
    where i.order_id = o.id
      and (o.product_name = '' or o.product_codename = '')
    returning o.id`;

  console.log(`\nupdated ${updated.length} order(s)`);

  const left = await rawSql<{ total: number }[]>`
    select count(*)::int as total from orders where product_name = '' or product_codename = ''`;
  console.log(`${left[0].total} still blank (orders with no order_items row)`);

  await rawSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
