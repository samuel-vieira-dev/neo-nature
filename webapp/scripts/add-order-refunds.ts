/** npx tsx --env-file=.env.local scripts/add-order-refunds.ts */
import { rawSql } from "../src/db";
async function main() {
  await rawSql.begin(async tx => {
    await tx`create table if not exists order_refunds (
      id text primary key, order_id text not null references orders(id),
      mode text not null, kind text not null, amount numeric(10,2) not null,
      currency text not null, reason text not null, admin_user_id text not null,
      status text not null, provider_reference text, message text not null,
      created_at timestamptz not null default now()
    )`;
    await tx`create index if not exists order_refunds_order_mode on order_refunds(order_id, mode)`;
  });
  console.log("Order refund ledger ready.");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => rawSql.end());
