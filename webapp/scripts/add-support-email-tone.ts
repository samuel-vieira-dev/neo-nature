/** Additive migration for the admin-editable support email voice. */
import { rawSql } from "../src/db";
rawSql`create table if not exists support_email_tone (
  id text primary key, instructions text not null default '', version integer not null default 1,
  updated_by text references admin_users(id), updated_at timestamptz not null default now()
)`.then(() => console.log("Support email tone settings ready.")).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => rawSql.end());
