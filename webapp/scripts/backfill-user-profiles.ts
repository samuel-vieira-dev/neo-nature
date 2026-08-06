/**
 * One-off backfill: fill empty account fields (name/fullName/email/address)
 * from the customer's BuyGoods orders.
 *
 * hydrateUserFromOrders only runs at ingest and at login/link time, so an
 * account created before it existed — or one whose owner never signed in
 * again — keeps an empty name even though the CRM shows it (the CRM reads the
 * name off the ORDER, not the account). That's why "View as" could open an
 * app with a blank greeting for a customer we clearly know the name of.
 *
 * Usage: npx tsx scripts/backfill-user-profiles.ts [--dry-run]
 */
import { desc, eq, or } from "drizzle-orm";
import { db, rawSql } from "../src/db";
import { users, orders } from "../src/db/schema";
import { linkOrdersToUser } from "../src/server/buygoods";
import { firstNameOf } from "../src/lib/name";

const dryRun = process.argv.includes("--dry-run");

/** Same order the hydration would pick: the customer's latest, by any identifier. */
async function sourceOrderFor(user: typeof users.$inferSelect) {
  const conditions = [eq(orders.userId, user.id)];
  if (user.email) conditions.push(eq(orders.email, user.email.toLowerCase()));
  if (user.phone) conditions.push(eq(orders.customerPhoneE164, user.phone));
  return db.query.orders.findFirst({
    where: conditions.length > 1 ? or(...conditions) : conditions[0],
    orderBy: [desc(orders.placedAt)],
  });
}

async function main() {
  const all = await db.query.users.findMany();
  const incomplete = all.filter((u) => !u.name || !u.fullName || !u.email || !u.address);

  console.log(`${all.length} accounts, ${incomplete.length} missing at least one of name/fullName/email/address\n`);

  let filled = 0;
  let noOrder = 0;

  for (const user of incomplete) {
    const order = await sourceOrderFor(user);
    if (!order) {
      noOrder++;
      continue;
    }

    // preview only — hydrateUserFromOrders is what actually decides and writes
    const wouldFill: string[] = [];
    const fullName = order.customerName.trim();
    if (!user.fullName && fullName) wouldFill.push(`fullName="${fullName}"`);
    if (!user.name && fullName) wouldFill.push(`name="${firstNameOf(fullName)}"`);
    if (!user.address && order.address) wouldFill.push(`address="${order.address.slice(0, 40)}"`);
    if (!user.email && order.email.trim()) wouldFill.push(`email="${order.email.trim().toLowerCase()}"`);
    if (wouldFill.length === 0) continue;

    console.log(`  ${user.id} (${user.email ?? user.phone ?? "sem identificador"}) → ${wouldFill.join(", ")}`);
    if (!dryRun) await linkOrdersToUser(user.id, { email: user.email, phone: user.phone });
    filled++;
  }

  console.log(`\n${dryRun ? "[dry run] would fill" : "filled"}: ${filled}`);
  console.log(`skipped, no matching order: ${noOrder}`);
  if (dryRun) console.log("\nrode sem --dry-run para aplicar");
}

main()
  .then(async () => {
    await rawSql.end();
  })
  .catch(async (e) => {
    console.error(e);
    await rawSql.end();
    process.exit(1);
  });
