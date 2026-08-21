/**
 * LOCAL-ONLY fixture: a UK customer with a BuyGoods purchase made of a main
 * order + an upsell + a downsell (minutes apart, same tracking id), shipped
 * 2 days ago and not delivered — exercises the pre-arrival onboarding, the
 * Home tracking card and upsell/downsell folding. Sign in with GB · 07713 480000.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-seed-prearrival.ts
 */
import { rawSql } from "../src/db";

const PHONE = "+447713480000";
const base = new Date(Date.now() - 3 * 24 * 3600 * 1000);
const min = (n: number) => new Date(base.getTime() + n * 60_000);
const fulfilled = new Date(Date.now() - 2 * 24 * 3600 * 1000);
const steps = (shipped: boolean, status: string) =>
  JSON.stringify([
    { label: "Order confirmed", detail: "We received your order", date: base.toDateString(), done: true },
    { label: "Payment received", detail: "", date: base.toDateString(), done: true },
    { label: "Preparing your order", detail: "", date: "", done: shipped, current: !shipped },
    { label: "Shipped", detail: shipped ? status : "", date: shipped ? fulfilled.toDateString() : "", done: shipped, current: shipped },
  ]);

async function main() {
  await rawSql`delete from users where phone = ${PHONE}`;
  await rawSql`delete from orders where customer_phone_e164 = ${PHONE} or id like 'bg-UKTEST%'`;
  const rows = [
    { id: "bg-UKTEST1", bg: "UKTEST1", num: "900001", at: min(0), code: "heroup", name: "HeroUp - 3 Bottles", total: "129.00", trk: "GFUS01065804546499" },
    { id: "bg-UKTEST2", bg: "UKTEST2", num: "900002", at: min(3), code: "uheroup2", name: "HeroUp - 2 Extra Bottles (upsell)", total: "59.00", trk: "GFUS01065804546499" },
    { id: "bg-UKTEST3", bg: "UKTEST3", num: "900003", at: min(6), code: "dnervecalm", name: "NerveCalm - 1 Bottle (downsell)", total: "29.00", trk: null },
  ];
  for (const r of rows) {
    await rawSql`insert into orders (id, source, buygoods_order_id, email, customer_phone, customer_phone_e164, number, placed_at, status, total, currency,
        shipping_status, shipping_tracking_id, fulfilled_at, address, product_name, product_codename, customer_name, tracking_steps)
      values (${r.id}, 'buygoods', ${r.bg}, 'uk.buyer@example.com', '07713 480000', ${PHONE}, ${r.num}, ${r.at.toISOString()}, 'shipped', ${r.total}, 'USD',
        'EN ROUTE TO DHL ECOMMERCE DISTRIBUTION CENTER', ${r.trk}, ${fulfilled.toISOString()}, '10 Downing St, London, , SW1A 2AA, United Kingdom', ${r.name}, ${r.code}, 'Emma Watson', ${steps(true, "EN ROUTE TO DHL ECOMMERCE DISTRIBUTION CENTER")}::jsonb)`;
    await rawSql`insert into order_items (order_id, product_codename, product_name, qty, price) values (${r.id}, ${r.code}, ${r.name}, 1, ${r.total})`;
  }
  console.log("seeded 3 UK orders for", PHONE);
  await rawSql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
