/** Additive migration. Run only against the chosen test environment. */
import { rawSql } from "../src/db";

async function main() {
  await rawSql.begin(async tx => {
    await tx`create table if not exists support_email_conversations (
      id text primary key, mailbox_id text not null, thread_id text not null, email text not null,
      name text not null default '', subject text not null, tier text not null default 'T1',
      language text not null default 'en', owner text not null default 'agent', status text not null default 'queued',
      latest_message_id text, freshdesk_id integer, escalation_reason text, first_replied_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    )`;
    await tx`create unique index if not exists support_email_thread on support_email_conversations(mailbox_id, thread_id)`;
    await tx`create unique index if not exists support_email_freshdesk on support_email_conversations(freshdesk_id)`;
    await tx`create index if not exists support_email_updated on support_email_conversations(updated_at, id)`;
    await tx`create table if not exists support_email_messages (
      id text primary key, conversation_id text not null references support_email_conversations(id),
      dedupe_key text not null unique, provider_message_id text not null, rfc_message_id text,
      direction text not null, subject text not null, text text not null,
      "references" jsonb not null default '[]', attachments jsonb not null default '[]',
      received_at timestamptz not null, created_at timestamptz not null default now()
    )`;
    await tx`create index if not exists support_email_message_thread on support_email_messages(conversation_id, created_at)`;
    await tx`create table if not exists support_email_jobs (
      id text primary key, conversation_id text not null references support_email_conversations(id),
      message_id text not null references support_email_messages(id), stage text not null default 'prepare',
      status text not null default 'queued', run_at timestamptz not null default now(), send_after timestamptz not null,
      attempts integer not null default 0, draft jsonb, error text, started_at timestamptz,
      created_at timestamptz not null default now()
    )`;
    await tx`create unique index if not exists support_email_job_message_stage on support_email_jobs(message_id, stage)`;
    await tx`create index if not exists support_email_job_due on support_email_jobs(status, run_at)`;
  });
  console.log("Support email tables ready. Delivery remains controlled by SUPPORT_EMAIL_MODE.");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => rawSql.end());
