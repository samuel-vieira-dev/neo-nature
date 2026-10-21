/** Manual additive DDL. Apply before deploying partial-rollout code; never auto-run. */
import { rawSql } from "../src/db";

async function main() {
  await rawSql`alter table support_email_tone
    add column if not exists partial_rollout_enabled boolean not null default false,
    add column if not exists t1_send_percent integer not null default 0`;
  await rawSql`do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'support_email_t1_send_percent_range'
      and conrelid = 'support_email_tone'::regclass) then
      alter table support_email_tone add constraint support_email_t1_send_percent_range
        check (t1_send_percent between 0 and 100);
    end if;
  end $$`;
  console.log("Support email partial rollout settings ready (disabled, 0% by default).");
}

main().catch(() => { console.error("Partial rollout DDL failed."); process.exitCode = 1; }).finally(() => rawSql.end());
