/** Additive, idempotent migration. Run before deploying the refund form:
 * npx tsx --env-file=.env.local scripts/add-refund-form.ts
 * Use the intended environment file explicitly for production.
 */
import { rawSql } from "../src/db";
import { defaultRefundForm } from "../src/lib/refund/form";
async function main() {
  await rawSql.begin(async tx => {
    await tx`alter table tickets add column if not exists refund_response jsonb`;
    await tx`alter table tickets add column if not exists refund_review_status text not null default 'new'`;
    await tx`alter table tickets add column if not exists refund_notes text not null default ''`;
    await tx`create table if not exists refund_forms (id serial primary key, definition jsonb not null, created_at timestamptz not null default now())`;
    await tx`insert into refund_forms (id, definition) values (0, ${JSON.stringify(defaultRefundForm)}::jsonb) on conflict (id) do nothing`;
    await tx`create table if not exists refund_uploads (
      id text primary key, user_id text not null references users(id) on delete cascade,
      request_id text not null, field_id text not null, name text not null, mime text not null,
      size integer not null, data_base64 text not null, created_at timestamptz not null default now()
    )`;
    await tx`create index if not exists refund_upload_request on refund_uploads(user_id, request_id)`;
    await tx`create table if not exists refund_requests (
      id text primary key, user_id text not null references users(id) on delete cascade,
      form_version integer not null, form_definition jsonb not null, answers jsonb not null default '{}'::jsonb,
      current_page_id text not null, outcome text not null default 'draft',
      ticket_id text references tickets(id) on delete set null,
      review_status text not null default 'new', notes text not null default '',
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      submitted_at timestamptz
    )`;
    await tx`create index if not exists refund_request_user on refund_requests(user_id)`;
    await tx`create index if not exists refund_request_updated on refund_requests(updated_at)`;
    await tx`insert into refund_requests
      (id, user_id, form_version, form_definition, answers, current_page_id, outcome, ticket_id,
       review_status, notes, created_at, updated_at, submitted_at)
      select coalesce(t.client_request_id, 'legacy-' || t.id), t.user_id,
        coalesce((t.refund_response ->> 'version')::integer, 0), t.refund_response -> 'form',
        coalesce(t.refund_response -> 'answers', '{}'::jsonb), t.refund_response ->> 'endPage',
        coalesce(t.refund_response ->> 'outcome', 'refund'), t.id,
        t.refund_review_status, t.refund_notes, t.created_at, t.created_at, t.created_at
      from tickets t where t.refund_response is not null
      on conflict (id) do update set ticket_id = excluded.ticket_id,
        outcome = excluded.outcome, submitted_at = excluded.submitted_at`;
  });
  console.log("Refund form schema ready.");
}
main().catch(e => {console.error(e);process.exitCode=1;}).finally(()=>rawSql.end());
