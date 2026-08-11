/**
 * One-off cleanup for the duplicate tickets opened by the un-guarded refund
 * save-offer buttons (a tap during the Freshdesk round-trip opened one ticket
 * per tap — see the fix in src/app/support/new/page.tsx).
 *
 * For each (user, subject) group it KEEPS the oldest ticket — the tap the
 * customer meant — and removes the rest, in Freshdesk first and then in our
 * local mirror. Freshdesk is a separate system: deleting our rows alone leaves
 * the duplicates sitting in the agents' queue, which is why this script talks
 * to both.
 *
 * Freshdesk's DELETE /api/v2/tickets/:id moves a ticket to Trash (recoverable
 * there for 30 days) rather than erasing it — so a mistake here is undoable.
 *
 * Scope it explicitly. Nothing runs without --email, and it never touches a
 * group of one, so a customer's genuine tickets are left alone.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/dedupe-tickets.ts --email=someone@example.com
 *        ^ dry run by default: prints exactly what it would delete, changes nothing
 *
 *   npx tsx --env-file=.env.local scripts/dedupe-tickets.ts --email=someone@example.com --apply
 *        ^ actually deletes (Freshdesk + local)
 *
 *   ...  --since=2026-08-10 --until=2026-08-11   restrict to an incident window
 *   ...  --local-only                            skip Freshdesk, clean the mirror only
 *
 * Run against production by pointing at the prod database:
 *   npx tsx --env-file=.env.production scripts/dedupe-tickets.ts --email=...
 */
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db, rawSql } from "../src/db";
import { tickets, users } from "../src/db/schema";

const arg = (name: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const email = arg("email");
const since = arg("since");
const until = arg("until");
const apply = flag("apply");
const localOnly = flag("local-only");

async function deleteInFreshdesk(freshdeskId: number): Promise<{ ok: boolean; detail: string }> {
  const domain = process.env.FRESHDESK_DOMAIN;
  const apiKey = process.env.FRESHDESK_API_KEY;
  if (!domain || !apiKey) return { ok: false, detail: "FRESHDESK_DOMAIN/FRESHDESK_API_KEY not set" };

  const auth = Buffer.from(`${apiKey}:X`).toString("base64");
  try {
    const res = await fetch(`https://${domain}.freshdesk.com/api/v2/tickets/${freshdeskId}`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${auth}` },
    });
    // 204 = moved to trash. 404 = already gone, which is the state we want anyway.
    if (res.status === 204 || res.status === 404) return { ok: true, detail: String(res.status) };
    return { ok: false, detail: `HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}` };
  } catch (e) {
    return { ok: false, detail: `network: ${e}` };
  }
}

async function main() {
  if (!email) {
    console.error("Refusing to run without --email=<customer email>. See the header for usage.");
    process.exit(1);
  }

  const user = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase().trim()) });
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }

  const window = [eq(tickets.userId, user.id)];
  if (since) window.push(gte(tickets.createdAt, new Date(`${since}T00:00:00Z`)));
  if (until) window.push(lt(tickets.createdAt, new Date(`${until}T00:00:00Z`)));

  const rows = await db.query.tickets.findMany({
    where: and(...window),
    orderBy: [asc(tickets.createdAt)],
  });

  // Oldest-first above, so the first row of each group is the keeper.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.subject;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const doomed: typeof rows = [];
  console.log(`\nTickets for ${email} (${rows.length} in scope):\n`);
  for (const [subject, group] of groups) {
    const [keep, ...rest] = group;
    console.log(`  "${subject}" — ${group.length} ticket(s)`);
    console.log(`    KEEP   ${keep.id}  freshdesk=${keep.freshdeskId ?? "—"}  ${keep.createdAt.toISOString()}`);
    for (const row of rest) {
      console.log(`    DELETE ${row.id}  freshdesk=${row.freshdeskId ?? "—"}  ${row.createdAt.toISOString()}`);
      doomed.push(row);
    }
  }

  if (doomed.length === 0) {
    console.log("\nNothing to clean up — no subject has more than one ticket in scope.\n");
    return;
  }

  if (!apply) {
    console.log(
      `\nDRY RUN — nothing was changed. ${doomed.length} ticket(s) would be deleted` +
        `${localOnly ? " locally only" : " in Freshdesk and locally"}.` +
        `\nRe-run with --apply to execute.\n`
    );
    return;
  }

  let freshdeskDeleted = 0;
  let freshdeskFailed = 0;
  for (const row of doomed) {
    if (localOnly || !row.freshdeskId) continue;
    const res = await deleteInFreshdesk(row.freshdeskId);
    if (res.ok) {
      freshdeskDeleted++;
    } else {
      freshdeskFailed++;
      console.error(`  ! Freshdesk ${row.freshdeskId} (${row.id}): ${res.detail}`);
    }
  }

  // Only drop the local row once Freshdesk is clean, otherwise we'd lose the
  // freshdesk_id and with it any way to find the leftover ticket again.
  if (freshdeskFailed > 0) {
    console.error(
      `\nStopped: ${freshdeskFailed} Freshdesk deletion(s) failed. Local rows were left intact ` +
        `so you can retry — they still carry the freshdesk_id.\n`
    );
    process.exit(1);
  }

  for (const row of doomed) {
    await db.delete(tickets).where(eq(tickets.id, row.id));
  }

  console.log(
    `\nDone. Deleted ${doomed.length} local ticket(s)` +
      `${localOnly ? " (Freshdesk untouched)" : `, ${freshdeskDeleted} moved to Freshdesk's Trash`}.\n`
  );
}

main()
  .then(() => rawSql.end())
  .catch(async (e) => {
    console.error(e);
    await rawSql.end();
    process.exit(1);
  });
