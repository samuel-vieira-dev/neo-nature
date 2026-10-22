/**
 * Outage backfill for T1 support emails without an automatic reply (Railway outage 21/10 ~18:00 → 22/10 ~09:38 BRT).
 * DRY-RUN by default: lists candidate ticket numbers and the projected T1 counter decision.
 * --execute only re-queues the normal "prepare" job; the deployed worker then generates,
 * samples (shared counter), tags "Not answered"/"Human required" and sends as usual.
 * Never loads .env: DATABASE_URL must be provided explicitly. Never run against production without approval.
 *
 *   npx tsx scripts/backfill-outage-t1-replies.ts [--since 2026-10-21T18:00:00-03:00] [--until 2026-10-22T09:38:00-03:00] [--limit 500] [--execute]
 */
import { pathToFileURL } from "node:url";
import { db, rawSql } from "../src/db";
import { backfillOutageT1, parseBackfillArgs } from "../src/server/support-email-backfill";
import { readSupportEmailTone } from "../src/server/support-email-tone";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be explicitly provided");
    const options = parseBackfillArgs(process.argv.slice(2));
    const tone = await readSupportEmailTone();
    const result = await backfillOutageT1(db, options, { partialRolloutEnabled: tone.partialRolloutEnabled, t1SendPercent: tone.t1SendPercent });
    console.log(JSON.stringify(result, null, 2));
    if (!options.execute) console.log("\nDry-run only. Nothing was changed. Re-run with --execute to queue the eligible tickets.");
  })()
    .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
    .finally(() => rawSql.end());
}
