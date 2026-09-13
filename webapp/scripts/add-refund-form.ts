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
  });
  console.log("Refund form schema ready.");
}
main().catch(e => {console.error(e);process.exitCode=1;}).finally(()=>rawSql.end());
