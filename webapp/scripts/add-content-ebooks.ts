/** Manual additive DDL for native e-books. Idempotent, non-destructive; apply before deploying; never auto-run. */
import { rawSql } from "../src/db";

async function main() {
  await rawSql`create table if not exists content_ebooks (
    id text primary key,
    title text not null,
    summary text not null default '',
    category text not null,
    cover_image_id text,
    chapters jsonb not null default '[]'::jsonb,
    status text not null default 'draft',
    published jsonb,
    published_at timestamptz,
    version integer not null default 1,
    created_by text,
    created_at timestamptz not null default now(),
    updated_by text,
    updated_at timestamptz not null default now()
  )`;
  await rawSql`create table if not exists content_ebook_revisions (
    id serial primary key,
    ebook_id text not null references content_ebooks(id),
    version integer not null,
    snapshot jsonb not null,
    status text not null,
    action text not null,
    admin_id text,
    created_at timestamptz not null default now()
  )`;
  await rawSql`create unique index if not exists content_ebook_revision on content_ebook_revisions (ebook_id, version)`;
  await rawSql`create table if not exists content_ebook_progress (
    user_id text not null references users(id) on delete cascade,
    ebook_id text not null references content_ebooks(id) on delete cascade,
    chapter_id text not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, ebook_id)
  )`;
  console.log("Content e-book tables ready.");
}

main().catch(() => { console.error("Content e-books DDL failed."); process.exitCode = 1; }).finally(() => rawSql.end());
