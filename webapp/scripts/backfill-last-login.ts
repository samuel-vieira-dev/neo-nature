/**
 * One-off backfill: populate users.last_login_at for accounts created before
 * the column existed.
 *
 * The CRM's "App" tag used to mean "a users row exists", which "View as" on a
 * lead creates as a side effect (see /api/admin/impersonate) — so leads the
 * admin merely previewed were counted as app adopters. The tag now keys on
 * last_login_at, which starts null for every legacy row; this script decides,
 * per account, whether the customer really signed in.
 *
 * An account counts as a real login when it shows evidence only the customer
 * could produce: finished onboarding, logged a dose, or registered a push
 * subscription. Everything else stays null — including accounts whose only
 * trace is an "impersonate_lead" entry in the admin audit log.
 *
 * Timestamp used: onboardedAt when known, else the earliest dose, else
 * createdAt — approximate on purpose, since only null-vs-set drives the tag.
 *
 * Usage: npx tsx scripts/backfill-last-login.ts [--dry-run]
 */
import { eq, sql } from "drizzle-orm";
import { db, rawSql } from "../src/db";
import { users, doseLogs, pushSubscriptions, adminActionLogs } from "../src/db/schema";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const all = await db.query.users.findMany();
  const pending = all.filter((u) => !u.lastLoginAt);

  const doses = await db
    .select({ userId: doseLogs.userId, first: sql<string>`min(${doseLogs.takenAt})` })
    .from(doseLogs)
    .groupBy(doseLogs.userId);
  const firstDose = new Map(doses.map((d) => [d.userId, new Date(d.first)]));

  const pushed = new Set(
    (await db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions)).map((p) => p.userId)
  );

  const previewedLeads = new Set(
    (
      await db
        .select({ userId: adminActionLogs.targetUserId })
        .from(adminActionLogs)
        .where(eq(adminActionLogs.action, "impersonate_lead"))
    )
      .map((l) => l.userId)
      .filter((id): id is string => !!id)
  );

  console.log(`${all.length} accounts, ${pending.length} without last_login_at\n`);

  let marked = 0;
  let left = 0;

  for (const user of pending) {
    const dose = firstDose.get(user.id);
    const signedIn = !!user.onboardedAt || !!dose || pushed.has(user.id);
    const label = user.email ?? user.phone ?? user.id;

    if (!signedIn) {
      left++;
      const why = previewedLeads.has(user.id) ? "lead previewed via View as" : "no sign of a real login";
      console.log(`  - ${label} → left null (${why})`);
      continue;
    }

    const at = user.onboardedAt ?? dose ?? user.createdAt;
    const why = user.onboardedAt ? "onboarded" : dose ? "logged a dose" : "push subscription";
    console.log(`  ✓ ${label} → ${at.toISOString()} (${why})`);
    if (!dryRun) await db.update(users).set({ lastLoginAt: at }).where(eq(users.id, user.id));
    marked++;
  }

  console.log(`\n${dryRun ? "[dry run] would mark" : "marked"} as signed in: ${marked}`);
  console.log(`left without app access: ${left}`);
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
