/**
 * One-off backfill: set orders.upsell_flag from the flag_upsell field BuyGoods
 * sends on every IPN. The column was added on 2026-08-21; every raw request is
 * kept in webhook_logs, so older orders can be stamped without BuyGoods
 * resending anything. The app folds upsell/downsell rows into the main order
 * of the same checkout (src/server/order-groups.ts) — the flag is the
 * authoritative signal, the u…/d… codename prefix only the fallback.
 *
 * Also prints codename × flag so the prefix rule can be sanity-checked against
 * what BuyGoods actually flags (e.g. "hero6_3_234" — flagged or not?).
 *
 * Dry run by default — prints what would change and touches nothing.
 *
 * Usage:
 *   npx tsx --env-file=.env.production scripts/backfill-upsell-flag.ts
 *   npx tsx --env-file=.env.production scripts/backfill-upsell-flag.ts --apply
 */
import { asc, eq, sql } from "drizzle-orm";
import { db, rawSql } from "../src/db";
import { webhookLogs, orders } from "../src/db/schema";
import { parseIpnParams } from "../src/server/buygoods";
import { isAddOnCodename } from "../src/server/order-groups";

const apply = process.argv.includes("--apply");

async function main() {
  const logs = await db.query.webhookLogs.findMany({
    where: sql`source = 'buygoods' and (body like '%flag_upsell%' or body like '%"flag_upsell"%')`,
    orderBy: [asc(webhookLogs.receivedAt)],
    columns: { body: true, query: true },
  });

  // last write wins per order — logs are sorted oldest-first above
  const flagByOrder = new Map<string, boolean>();
  for (const log of logs) {
    const p = parseIpnParams(log.query, log.body);
    const bgId = p.order_id_global?.trim();
    if (!bgId || p.flag_upsell === undefined || p.flag_upsell === "") continue;
    flagByOrder.set(bgId, p.flag_upsell === "1");
  }
  console.log(`${logs.length} webhook_logs rows scanned, ${flagByOrder.size} distinct orders with flag_upsell · ${apply ? "APPLYING" : "dry run"}`);

  const rows = await db.query.orders.findMany({
    where: eq(orders.source, "buygoods"),
    columns: { id: true, buygoodsOrderId: true, productCodename: true, upsellFlag: true },
  });

  // codename × flag sanity table
  const table = new Map<string, { flagged: number; unflagged: number; unknown: number }>();
  let toSet = 0;
  let disagreements = 0;
  for (const o of rows) {
    const flag = o.buygoodsOrderId ? flagByOrder.get(o.buygoodsOrderId) : undefined;
    const t = table.get(o.productCodename) ?? { flagged: 0, unflagged: 0, unknown: 0 };
    if (flag === true) t.flagged++;
    else if (flag === false) t.unflagged++;
    else t.unknown++;
    table.set(o.productCodename, t);
    if (flag !== undefined && flag !== o.upsellFlag) toSet++;
    if (flag !== undefined && flag !== isAddOnCodename(o.productCodename)) disagreements++;
  }

  console.log("\ncodename                    flagged  unflagged  unknown   (prefix says)");
  for (const [code, t] of [...table.entries()].sort((a, b) => b[1].flagged + b[1].unflagged + b[1].unknown - (a[1].flagged + a[1].unflagged + a[1].unknown))) {
    const prefix = isAddOnCodename(code) ? "add-on" : "main";
    const warn = (prefix === "add-on" && t.unflagged > 0) || (prefix === "main" && t.flagged > 0) ? "  <-- prefix and flag disagree" : "";
    console.log(`${code.padEnd(28)}${String(t.flagged).padStart(7)}${String(t.unflagged).padStart(11)}${String(t.unknown).padStart(9)}   ${prefix}${warn}`);
  }
  console.log(`\n${toSet} order(s) would get upsell_flag set/changed; ${disagreements} where flag and codename prefix disagree.`);

  if (!apply) {
    if (toSet) console.log("Re-run with --apply to write.");
    await rawSql.end();
    return;
  }

  let updated = 0;
  for (const o of rows) {
    const flag = o.buygoodsOrderId ? flagByOrder.get(o.buygoodsOrderId) : undefined;
    if (flag === undefined || flag === o.upsellFlag) continue;
    await db.update(orders).set({ upsellFlag: flag }).where(eq(orders.id, o.id));
    updated++;
  }
  console.log(`updated ${updated} order(s).`);
  await rawSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
