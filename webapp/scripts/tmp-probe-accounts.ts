/**
 * READ-ONLY probe: which sales platforms / merchant accounts are in the data,
 * and what each one sells — input for labelling "purchase origin" in the admin
 * CRM (BuyGoods account 11227 vs 11020, Konnektive, …).
 *
 * Usage: npx tsx --env-file=.env.production scripts/tmp-probe-accounts.ts
 */
import { rawSql } from "../src/db";

async function main() {
  console.log("== source × buygoods_account_id ==");
  const rows = (await rawSql`
    select source,
           coalesce(buygoods_account_id, '(none)') acct,
           count(*) orders,
           count(distinct email) customers,
           round(sum(total)::numeric, 2) gross,
           min(placed_at)::date first_at,
           max(placed_at)::date last_at
    from orders
    group by 1, 2
    order by orders desc
  `) as unknown as Record<string, string>[];
  for (const r of rows) {
    console.log(
      `${String(r.source).padEnd(11)} acct=${String(r.acct).padEnd(8)} ${String(r.orders).padStart(5)} pedidos  ${String(r.customers).padStart(5)} clientes  $${r.gross}  ${r.first_at} → ${r.last_at}`
    );
  }

  console.log("\n== produtos por conta (top 6 de cada) ==");
  const perAcct = (await rawSql`
    select source, coalesce(buygoods_account_id, '(none)') acct, product_name, count(*) n
    from orders
    where product_name <> ''
    group by 1, 2, 3
    order by acct, n desc
  `) as unknown as Record<string, string>[];
  const seen = new Map<string, number>();
  for (const r of perAcct) {
    const key = `${r.source}/${r.acct}`;
    const n = seen.get(key) ?? 0;
    if (n >= 6) continue;
    seen.set(key, n + 1);
    if (n === 0) console.log(`\n${key}:`);
    console.log(`   ${String(r.n).padStart(4)}  ${r.product_name}`);
  }

  console.log("\n== funis por conta (top 4) ==");
  const funnels = (await rawSql`
    select coalesce(buygoods_account_id, '(none)') acct, coalesce(funnel, '(sem funil)') funnel, count(*) n
    from orders where source = 'buygoods'
    group by 1, 2 order by acct, n desc
  `) as unknown as Record<string, string>[];
  const seen2 = new Map<string, number>();
  for (const r of funnels) {
    const n = seen2.get(r.acct) ?? 0;
    if (n >= 4) continue;
    seen2.set(r.acct, n + 1);
    if (n === 0) console.log(`\nacct ${r.acct}:`);
    console.log(`   ${String(r.n).padStart(4)}  ${r.funnel}`);
  }

  console.log("\n== campos de plataforma nos webhook_logs (amostra de chaves) ==");
  const kn = (await rawSql`
    select body from webhook_logs where source = 'konnektive' order by id desc limit 1
  `) as unknown as { body: string }[];
  if (kn[0]) {
    try {
      const j = JSON.parse(String(kn[0].body)) as Record<string, unknown>;
      const keys = Object.keys(j).filter((k) => /campaign|merchant|gateway|mid|affil|source/i.test(k));
      console.log("konnektive:", keys.map((k) => `${k}=${String(j[k]).slice(0, 30)}`).join(" | ") || "(nenhum)");
    } catch {
      console.log("konnektive: corpo não é JSON");
    }
  } else {
    console.log("konnektive: nenhum log capturado");
  }

  await rawSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
