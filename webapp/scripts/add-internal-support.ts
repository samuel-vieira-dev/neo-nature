/** Additive, idempotent support desk migration. Never sends mail or calls Freshdesk. */
import { rawSql, db } from "../src/db";
import { supportKnowledgeArticles, supportKnowledgeRevisions } from "../src/db/schema";
import { faqs } from "../src/lib/data";
async function main() {
  await rawSql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('internal-support-migration'))`;
    await tx`create sequence if not exists support_ticket_number_seq start with 10000`;
    await tx`alter table support_email_conversations add column if not exists ticket_number integer default nextval('support_ticket_number_seq'), add column if not exists ticket_status text not null default 'new', add column if not exists source text not null default 'email', add column if not exists legacy_ticket_id text, add column if not exists freshdesk_import_updated_at timestamptz, add column if not exists assigned_admin_id text, add column if not exists kind text not null default 'support', add column if not exists requires_human boolean not null default false`;
    await tx`alter table support_email_conversations alter column ticket_number set not null`;
    await tx`create unique index if not exists support_ticket_number_unique on support_email_conversations(ticket_number)`;
    await tx`create unique index if not exists support_legacy_ticket_unique on support_email_conversations(legacy_ticket_id)`;
    await tx`create index if not exists support_ticket_queue on support_email_conversations(ticket_status, requires_human, updated_at)`;
    await tx`alter table support_email_messages add column if not exists author_admin_id text`;
    await tx`alter table support_email_jobs add column if not exists actor_admin_id text, add column if not exists reply_status text`;
    await tx`drop index if exists support_email_job_message_stage`;
    await tx`create unique index support_email_job_message_stage on support_email_jobs(message_id,stage) where stage <> 'manual_send'`;
    await tx`alter table support_email_tone add column if not exists avoid_instructions text not null default '', add column if not exists min_delay_minutes integer, add column if not exists max_delay_minutes integer`;
    await tx`create table if not exists support_knowledge_articles (id text primary key,title text not null,content text not null,category text not null default 'General',channels jsonb not null default '["email","webapp"]',published jsonb,version integer not null default 1,updated_by text,updated_at timestamptz not null default now())`;
    await tx`create table if not exists support_knowledge_revisions (id serial primary key,article_id text not null references support_knowledge_articles(id),version integer not null,snapshot jsonb not null,action text not null,admin_id text,created_at timestamptz not null default now(),unique(article_id,version))`;
    await tx`create table if not exists support_ticket_attachments(id text primary key,message_id text not null references support_email_messages(id),filename text not null,content_type text not null,size integer not null,data text not null,source_key text not null unique)`;
    await tx`create table if not exists support_migrations(id text primary key,applied_at timestamptz not null default now())`;
    const applied=await tx`select id from support_migrations where id='internal-support-v1'`;
    if (!applied.length) {
      await tx`update support_email_conversations set ticket_status=case when status='resolved' then 'resolved' when status='replied' then 'pending' when owner='human' then 'open' else 'new' end`;
    // T3 is always a local human flag, even for replies prepared by an older worker.
    await tx`update support_email_conversations set requires_human=true,owner='human' where tier='T3' and ticket_status not in ('pending','resolved','closed')`;
    await tx`update support_email_jobs j set status='cancelled',error='T3_requires_human' from support_email_conversations c where j.conversation_id=c.id and c.tier='T3' and j.stage in ('prepare','send') and j.status in ('queued','review','blocked','failed')`;
      await tx`insert into support_migrations(id) values('internal-support-v1') on conflict do nothing`;
    }
    const historyFixed=await tx`select id from support_migrations where id='internal-support-history-v2'`;
    if(!historyFixed.length) {
      await tx`update support_email_messages m set direction='note',text='Imported app ticket summary (original customer description is not stored in this legacy mirror):' || chr(10) || m.text from support_email_conversations c where m.conversation_id=c.id and c.ticket_number<10000 and m.dedupe_key like 'legacy-ticket:%' and m.direction='incoming'`;
      await tx`update support_email_messages set author_admin_id='legacy-freshdesk' where dedupe_key like 'freshdesk-import:%' and direction='outgoing' and author_admin_id is null`;
      await tx`update support_email_conversations c set latest_message_id=(select m.id from support_email_messages m where m.conversation_id=c.id and m.direction='incoming' order by m.received_at desc,m.id desc limit 1) where c.ticket_number<10000 and exists(select 1 from support_email_messages current_message where current_message.id=c.latest_message_id and current_message.direction='note' and current_message.dedupe_key like 'legacy-ticket:%') and exists(select 1 from support_email_messages m where m.conversation_id=c.id and m.direction='incoming')`;
      await tx`insert into support_migrations(id) values('internal-support-history-v2')`;
    }
    await tx`create index if not exists support_email_received_history on support_email_messages(conversation_id,received_at,id)`;
  });
  for (const [i, faq] of faqs.entries()) {
    const snapshot = { title: faq.q, content: faq.a, category: "FAQ", channels: ["email", "webapp"] as ("email"|"webapp")[] };
    await db.insert(supportKnowledgeArticles).values({ id: `faq-${i+1}`, ...snapshot, published: snapshot }).onConflictDoNothing();
    await db.insert(supportKnowledgeRevisions).values({articleId:`faq-${i+1}`,version:1,snapshot,action:"initial-faq-import"}).onConflictDoNothing();
  }
  console.log("Internal support schema and initial knowledge ready.");
}
main().catch(e => { console.error(e); process.exitCode=1; }).finally(() => rawSql.end());
