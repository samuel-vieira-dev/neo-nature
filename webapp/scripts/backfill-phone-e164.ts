/**
 * One-off backfill: re-normalize orders.customer_phone_e164 using the order's
 * shipping country as parsing context (libphonenumber), then re-link orders to
 * app accounts by the corrected phone.
 *
 * Why: until 2026-08-21 the ingest assumed a US-centric checkout — a bare
 * 10-digit number became +1…, anything else became "+<digits>". International
 * customers type local formats ("07713 480000" in the UK), which produced
 * either null or a bogus E.164, so their orders never matched the phone they
 * sign in with. The country is the last piece of `orders.address`
 * ("…, London, , SW1A 1AA, United Kingdom").
 *
 * Dry run by default — prints what would change and touches nothing.
 *
 * Usage:
 *   npx tsx --env-file=.env.production scripts/backfill-phone-e164.ts
 *   npx tsx --env-file=.env.production scripts/backfill-phone-e164.ts --apply
 */
import { eq } from "drizzle-orm";
import { db, rawSql } from "../src/db";
import { orders, users } from "../src/db/schema";
import { normalizeIngestPhone } from "../src/lib/phone-format";

const apply = process.argv.includes("--apply");

const mask = (s: string | null) => (s ? s.slice(0, 4) + "…" + s.slice(-3) : "null");

async function main() {
  const rows = await db.query.orders.findMany({
    columns: { id: true, customerPhone: true, customerPhoneE164: true, address: true, userId: true },
  });
  console.log(`${rows.length} orders · ${apply ? "APPLYING" : "dry run"}`);

  let changed = 0;
  let nulled = 0;
  let linked = 0;
  for (const o of rows) {
    if (!o.customerPhone) continue;
    const country = o.address.split(",").map((s) => s.trim()).filter(Boolean).at(-1) ?? null;
    const next = normalizeIngestPhone(o.customerPhone, country);
    if (next === o.customerPhoneE164) continue;
    changed++;
    if (!next) nulled++;
    console.log(`${o.id}  ${mask(o.customerPhoneE164)} → ${mask(next)}  (country="${country ?? ""}")`);
    if (!apply) continue;

    await db.update(orders).set({ customerPhoneE164: next }).where(eq(orders.id, o.id));
    if (next && !o.userId) {
      const user = await db.query.users.findFirst({ where: eq(users.phone, next), columns: { id: true } });
      if (user) {
        await db.update(orders).set({ userId: user.id }).where(eq(orders.id, o.id));
        linked++;
      }
    }
  }
  console.log(`\n${changed} order(s) would change (${nulled} become null)${apply ? `, ${linked} newly linked to an account` : ""}.`);
  if (!apply && changed) console.log("Re-run with --apply to write.");
  await rawSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
