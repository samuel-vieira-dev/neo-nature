/** Manual additive DDL for support reports data capture (ticket resolution time, Ask AI questions). Idempotent, non-destructive; apply before deploying; never auto-run. */
import { rawSql } from "../src/db";

async function main() {
  await rawSql`alter table support_email_conversations add column if not exists resolved_at timestamptz`;
  await rawSql`create table if not exists support_ai_questions (
    id serial primary key,
    user_id text references users(id) on delete set null,
    question text not null,
    source text not null,
    order_question boolean not null default false,
    related jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
  )`;
  await rawSql`create index if not exists support_ai_questions_created on support_ai_questions (created_at)`;
  console.log("Support report data columns ready.");
}

main().catch(() => { console.error("Support report data DDL failed."); process.exitCode = 1; }).finally(() => rawSql.end());
