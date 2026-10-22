/** Manual additive DDL for knowledge editor images. Idempotent, non-destructive; apply before deploying; never auto-run. */
import { rawSql } from "../src/db";

async function main() {
  await rawSql`create table if not exists support_knowledge_images (
    id text primary key,
    filename text not null,
    content_type text not null,
    size integer not null,
    data bytea not null,
    created_by text,
    created_at timestamptz not null default now()
  )`;
  await rawSql`do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'support_knowledge_images_size'
      and conrelid = 'support_knowledge_images'::regclass) then
      alter table support_knowledge_images add constraint support_knowledge_images_size
        check (size > 0 and size <= 5242880);
    end if;
  end $$`;
  console.log("Knowledge images table ready.");
}

main().catch(() => { console.error("Knowledge images DDL failed."); process.exitCode = 1; }).finally(() => rawSql.end());
