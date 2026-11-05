/** Manual additive DDL for knowledge base arrangement (featured Quick answers + drag & drop order). Idempotent, non-destructive; apply before deploying; never auto-run. */
import { rawSql } from "../src/db";

async function main() {
  await rawSql`alter table support_knowledge_articles add column if not exists featured boolean not null default false`;
  await rawSql`alter table support_knowledge_articles add column if not exists sort_order integer`;
  console.log("Knowledge arrangement columns ready.");
}

main().catch(() => { console.error("Knowledge arrangement DDL failed."); process.exitCode = 1; }).finally(() => rawSql.end());
