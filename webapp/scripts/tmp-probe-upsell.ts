/**
 * READ-ONLY probe: how do upsell/downsell ("u*"/"d*" codename) orders relate to
 * the main order? (same tracking id? same customer? minutes apart?)
 *
 * Usage: npx tsx --env-file=.env.production scripts/tmp-probe-upsell.ts
 */
import { rawSql } from "../src/db";

const mask = (s: unknown) =>
  String(s ?? "")
    .replace(/\+\d{6}\d+/g, "+XXXXXX")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+/g, "<email>");

async function main() {
  const codenames = await rawSql`select product_codename, count(*) c, min(product_name) name, source from orders group by product_codename, source order by c desc`;
  console.log("== codenames ==");
  for (const r of codenames) console.log(`${String(r.c).padStart(4)}  ${r.source}  ${r.product_codename}  |  ${r.name}`);

  console.log("\n== items codenames ==");
  const ic = await rawSql`select product_codename, count(*) c, min(product_name) name from order_items group by product_codename order by c desc`;
  for (const r of ic) console.log(`${String(r.c).padStart(4)}  ${r.product_codename}  |  ${r.name}`);

  console.log("\n== customers with >1 order (sample, same phone) ==");
  const multi = await rawSql`
    select customer_phone_e164, count(*) c from orders where customer_phone_e164 is not null group by 1 having count(*)>1 order by c desc limit 8`;
  for (const m of multi) {
    console.log(`\n-- ${mask(m.customer_phone_e164)} (${m.c})`);
    const rows = await rawSql`select id, number, buygoods_order_id, source, placed_at, status, total, product_codename, shipping_tracking_id, buygoods_account_id, buygoods_user_id, user_id, shipping_status, fulfilled_at from orders where customer_phone_e164=${m.customer_phone_e164} order by placed_at`;
    for (const r of rows)
      console.log(
        `  ${r.id} num=${r.number} ${r.source} ${new Date(r.placed_at).toISOString()} ${r.status} $${r.total} ${r.product_codename} trk=${r.shipping_tracking_id} ship="${r.shipping_status}" ful=${r.fulfilled_at ? new Date(r.fulfilled_at).toISOString() : null} acct=${r.buygoods_account_id}/${r.buygoods_user_id} user=${r.user_id}`
      );
  }

  console.log("\n== orders with d*/u* codename: siblings within 1h for same customer ==");
  const du = await rawSql`
    select o.id, o.number, o.placed_at, o.product_codename, o.shipping_tracking_id, o.total, o.buygoods_account_id, o.buygoods_user_id,
      (select count(*) from orders p where p.id<>o.id and p.shipping_tracking_id is not null and p.shipping_tracking_id=o.shipping_tracking_id) as same_trk,
      (select string_agg(p.product_codename||'@'||p.placed_at::text||'#'||p.number||'/trk='||coalesce(p.shipping_tracking_id,'-'), ' ; ') from orders p where p.id<>o.id and p.customer_phone_e164=o.customer_phone_e164 and abs(extract(epoch from (p.placed_at-o.placed_at)))<3600) as siblings
    from orders o where o.product_codename ~ '^[du]' order by o.placed_at desc limit 30`;
  for (const r of du)
    console.log(
      `${r.id} num=${r.number} ${new Date(r.placed_at).toISOString()} ${r.product_codename} $${r.total} trk=${r.shipping_tracking_id} same_trk=${r.same_trk} acct=${r.buygoods_account_id}/${r.buygoods_user_id} | sib: ${r.siblings}`
    );

  console.log("\n== totals ==");
  const t = await rawSql`select count(*) total, count(*) filter (where product_codename ~ '^[du]') du, count(*) filter (where shipping_tracking_id is not null) with_trk, count(distinct shipping_tracking_id) distinct_trk, count(*) filter (where source='konnektive') kn from orders`;
  console.log(t[0]);

  console.log("\n== sample raw webhook payload of a u*/d* order (keys only + product fields) ==");
  const logs = await rawSql`select body from webhook_logs where source='buygoods' and (body ilike '%product_codename=u%' or body ilike '%product_codename=d%' or body ilike '%"product_codename":"u%' or body ilike '%"product_codename":"d%') order by id desc limit 2`;
  for (const l of logs) {
    const b = String(l.body);
    let params: Record<string, string> = {};
    if (b.trim().startsWith("{")) {
      try { params = Object.fromEntries(Object.entries(JSON.parse(b)).map(([k, v]) => [k, String(v)])); } catch { /* ignore */ }
    } else {
      params = Object.fromEntries(new URLSearchParams(b));
    }
    const interesting = Object.entries(params).filter(([k]) => /order|product|upsell|downsell|parent|funnel|sku|step|tracking|fulfil|type|action/i.test(k));
    console.log("keys:", Object.keys(params).join(","));
    for (const [k, v] of interesting) console.log(`   ${k} = ${mask(v).slice(0, 120)}`);
    console.log("   ---");
  }
  await rawSql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
