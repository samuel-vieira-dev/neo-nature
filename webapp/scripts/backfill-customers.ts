/**
 * Backfill the canonical `customers` table (Customer 360) from existing
 * orders + users, reproducing the CRM's historical clustering byte-for-byte —
 * both this script and crm.ts call the SAME clusterByLegacyRules() from
 * src/server/customer-identity.ts, so the validation matches by construction.
 *
 * Idempotent and safe under live webhooks: every UPDATE carries
 * `AND customer_id IS NULL`, so rows the live resolver already stamped are
 * never touched, and re-running only fills what's still missing.
 *
 * Known divergences vs. the old CRM (reported, expected):
 *  - orders with no email were invisible to the old CRM; here they attach by
 *    phone when possible and otherwise become solitary customers.
 *
 * Dry run by default — prints the report and touches nothing.
 *
 * Usage:
 *   npx tsx --env-file=.env.production scripts/backfill-customers.ts
 *   npx tsx --env-file=.env.production scripts/backfill-customers.ts --apply
 *   npx tsx --env-file=.env.production scripts/backfill-customers.ts --validate
 */
import { randomUUID } from "crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { customers, orders, users } from "../src/db/schema";
import { clusterByLegacyRules, type LegacyCluster } from "../src/server/customer-identity";

const apply = process.argv.includes("--apply");
const validate = process.argv.includes("--validate");

async function loadAll() {
  const [allOrders, allUsers, allCustomers] = await Promise.all([
    db.query.orders.findMany({
      columns: {
        id: true,
        email: true,
        customerPhoneE164: true,
        customerName: true,
        placedAt: true,
        customerId: true,
      },
    }),
    db.query.users.findMany({
      columns: { id: true, email: true, phone: true, fullName: true, customerId: true },
    }),
    db.query.customers.findMany(),
  ]);
  return { allOrders, allUsers, allCustomers };
}

async function backfill() {
  const { allOrders, allUsers, allCustomers } = await loadAll();
  const { clusters, orphanOrders } = clusterByLegacyRules(allOrders, allUsers);
  console.log(
    `${allOrders.length} orders · ${allUsers.length} users · ${allCustomers.length} customers already · ` +
      `${clusters.length} legacy clusters · ${orphanOrders.length} email-less orders · ${apply ? "APPLYING" : "dry run"}`
  );

  const byEmail = new Map(allCustomers.filter((c) => c.primaryEmail).map((c) => [c.primaryEmail!, c.id]));
  const byPhone = new Map<string, string>();
  for (const c of allCustomers) if (c.primaryPhone && !byPhone.has(c.primaryPhone)) byPhone.set(c.primaryPhone, c.id);

  const orderCustomer = new Map(allOrders.filter((o) => o.customerId).map((o) => [o.id, o.customerId!]));
  const userCustomer = new Map(allUsers.filter((u) => u.customerId).map((u) => [u.id, u.customerId!]));
  const orderPlaced = new Map(allOrders.map((o) => [o.id, o.placedAt.getTime()]));

  let created = 0;
  let reused = 0;
  let ordersLinked = 0;
  let usersLinked = 0;
  const conflicts: string[] = [];

  const createCustomer = async (c: { email: string | null; phone: string | null; name: string }): Promise<string> => {
    const id = randomUUID();
    created++;
    if (apply) {
      await db.insert(customers).values({ id, primaryEmail: c.email, primaryPhone: c.phone, name: c.name });
    }
    if (c.email) byEmail.set(c.email, id);
    if (c.phone && !byPhone.has(c.phone)) byPhone.set(c.phone, id);
    return id;
  };

  const linkCluster = async (cluster: LegacyCluster, customerId: string) => {
    const orderIds = cluster.orderIds.filter((id) => !orderCustomer.has(id));
    const userIds = cluster.userIds.filter((id) => !userCustomer.has(id));
    ordersLinked += orderIds.length;
    usersLinked += userIds.length;
    if (apply && orderIds.length) {
      await db
        .update(orders)
        .set({ customerId })
        .where(and(inArray(orders.id, orderIds), isNull(orders.customerId)));
    }
    if (apply && userIds.length) {
      await db
        .update(users)
        .set({ customerId })
        .where(and(inArray(users.id, userIds), isNull(users.customerId)));
    }
    // keep the in-memory picture current for the orphan pass below
    for (const id of orderIds) orderCustomer.set(id, customerId);
    for (const id of userIds) userCustomer.set(id, customerId);
    if (cluster.phone && !byPhone.has(cluster.phone)) byPhone.set(cluster.phone, customerId);
  };

  for (const cluster of clusters) {
    // 1) some member already stamped (live resolver got there first)?
    const memberIds = new Set<string>([
      ...cluster.orderIds.map((id) => orderCustomer.get(id)).filter((x): x is string => !!x),
      ...cluster.userIds.map((id) => userCustomer.get(id)).filter((x): x is string => !!x),
    ]);
    let customerId: string | null = null;
    if (memberIds.size > 0) {
      if (memberIds.size > 1) {
        conflicts.push(`cluster ${cluster.key}: members point at ${[...memberIds].join(", ")}`);
      }
      // pick the id of the OLDEST stamped member — deterministic across re-runs
      const stampedOrders = cluster.orderIds
        .filter((id) => orderCustomer.has(id))
        .sort((a, b) => (orderPlaced.get(a) ?? 0) - (orderPlaced.get(b) ?? 0));
      customerId = stampedOrders.length
        ? orderCustomer.get(stampedOrders[0])!
        : userCustomer.get(cluster.userIds.find((id) => userCustomer.has(id))!)!;
      reused++;
    } else if (cluster.email && byEmail.has(cluster.email)) {
      customerId = byEmail.get(cluster.email)!;
      reused++;
    } else {
      customerId = await createCustomer(cluster);
    }
    await linkCluster(cluster, customerId);
  }

  // 2) orders the old CRM never showed (no email): attach by phone, else solitary
  let orphansByPhone = 0;
  let orphansSolitary = 0;
  for (const o of [...orphanOrders].sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime())) {
    if (orderCustomer.has(o.id)) continue;
    let customerId: string | null = null;
    if (o.customerPhoneE164 && byPhone.has(o.customerPhoneE164)) {
      customerId = byPhone.get(o.customerPhoneE164)!;
      orphansByPhone++;
    } else {
      customerId = await createCustomer({
        email: null,
        phone: o.customerPhoneE164,
        name: o.customerName,
      });
      orphansSolitary++;
    }
    ordersLinked++;
    orderCustomer.set(o.id, customerId);
    if (apply) {
      await db
        .update(orders)
        .set({ customerId })
        .where(and(eq(orders.id, o.id), isNull(orders.customerId)));
    }
  }

  console.log(`\ncustomers created: ${created} · reused: ${reused}`);
  console.log(`orders linked: ${ordersLinked} · users linked: ${usersLinked}`);
  console.log(`email-less orders → attached by phone: ${orphansByPhone} · new solitary customers: ${orphansSolitary}`);
  if (conflicts.length) {
    console.log(`\nCONFLICTS (review manually — first stamped member won):`);
    for (const c of conflicts) console.log(`  ${c}`);
  }
  if (!apply) console.log(`\nDry run — nothing written. Re-run with --apply.`);
}

async function runValidation() {
  const { allOrders, allUsers } = await loadAll();
  const { clusters, orphanOrders } = clusterByLegacyRules(allOrders, allUsers);
  const orderCustomer = new Map(allOrders.map((o) => [o.id, o.customerId]));
  const userCustomer = new Map(allUsers.map((u) => [u.id, u.customerId]));

  let ok = 0;
  const split: string[] = [];
  const unstamped: string[] = [];
  for (const cluster of clusters) {
    const ids = new Set(
      [...cluster.orderIds.map((id) => orderCustomer.get(id)), ...cluster.userIds.map((id) => userCustomer.get(id))].filter(
        Boolean
      )
    );
    const nulls =
      cluster.orderIds.filter((id) => !orderCustomer.get(id)).length +
      cluster.userIds.filter((id) => !userCustomer.get(id)).length;
    if (ids.size === 1 && nulls === 0) ok++;
    else if (ids.size > 1)
      split.push(`cluster ${cluster.key}: ${ids.size} customer ids (${[...ids].join(", ")})`);
    else if (nulls > 0) unstamped.push(`cluster ${cluster.key}: ${nulls} unstamped member(s)`);
  }
  const orphanNulls = orphanOrders.filter((o) => !orderCustomer.get(o.id)).length;

  console.log(`\nVALIDATION`);
  console.log(`legacy clusters intact (single customer id, fully stamped): ${ok}/${clusters.length}`);
  if (split.length) {
    console.log(`clusters spanning >1 customer (expected only from the new email+phone merge policy):`);
    for (const s of split) console.log(`  ${s}`);
  }
  if (unstamped.length) {
    console.log(`clusters with unstamped members (re-run --apply):`);
    for (const s of unstamped) console.log(`  ${s}`);
  }
  console.log(`email-less orders still unstamped: ${orphanNulls}`);
  const totalNullOrders = allOrders.filter((o) => !o.customerId).length;
  const totalNullUsers = allUsers.filter((u) => !u.customerId).length;
  console.log(`orders with customer_id NULL: ${totalNullOrders} · users with customer_id NULL: ${totalNullUsers}`);
}

async function main() {
  if (validate && !apply) await runValidation();
  else {
    await backfill();
    if (validate) await runValidation();
  }
}

main().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});
