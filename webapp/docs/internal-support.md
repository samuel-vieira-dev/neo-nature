# Internal support desk

## Operations

`/admin/support` is the unified queue. New tickets use a global database sequence starting at #10000. Imported Freshdesk cases retain a `Legacy #…` display and their original reference without consuming new ticket numbers. Old app references remain linked.

Tickets are created automatically from incoming customer emails. Admin and CS can respond, add private notes, assign active Admin/CS staff and change New / Open / Pending / On hold / Resolved / Closed status. Read-only staff can view. Reopening follows incoming customer mail. A human reply changes the business status only after provider confirmation; processing/delivery state is separate. Staff notes and audit events never enter the AI prompt or customer history. Closing cancels unsent jobs; uncertain deliveries require explicit reconciliation.

Email handoffs are local by default even during the legacy import. The retired Freshdesk handoff path requires an explicit `SUPPORT_EMAIL_LEGACY_FRESHDESK_HANDOFF=true` rollback flag and is disabled when the global backend is internal.

Only T3 automatically sets `requiresHuman=true` and `owner=human`, shows **Human reply required**, and blocks automated replies/acknowledgements. Its generated reply is kept as an internal **AI suggestion (not sent)**. T1/T2 always get an AI reply with `needsHuman=false`, including staff-only account/order requests, supplement interactions, unread evidence and unsupported answers. The reply must explain limitations honestly, use approved paths when available, and suggest a healthcare professional for compatibility questions without medical advice. Staff takeover and existing human ownership remain human; uncertain delivery still requires reconciliation. App refund tickets retain their separate human flow; imported history is unchanged. The supplied tier examples are classification data only; product names, customer assertions about a guarantee and requested doses do not create policy. Fixtures live in `src/lib/support-tier-examples.json`.

Voice settings have positive **Do** and negative **Avoid** instructions, with optimistic version checking and staff audit. First-response minimum/maximum delay is persisted in minutes (1–1440); equal values fix the delay. Only the first automatic response uses it. Existing schedules are not rewritten; manual replies have no artificial delay. Actual sending happens on the next worker tick. Published knowledge and safety/financial permissions override style.

The agent reads the sender's verified orders at generation time: order status, shipping status, carrier/feed events, tracking code and URL. The raw code and verified link are included for an unambiguously selected order. A different claimed order never falls back to the only known purchase. This is the latest local provider/webhook snapshot, **not** a new real-time carrier API query. The webapp FAQ assistant also uses its authenticated customer's order snapshot for order questions. No carrier credentials were added.

`/admin/support/knowledge` lets Admin/CS save drafts, publish per email/webapp channel, unpublish and restore earlier versions into the draft editor. Publishing is explicit. The initial FAQ is seeded idempotently, preserving edits. The public FAQ list and webapp assistant use the same published source as email.

## Deployment and migration

1. Run `scripts/add-support-email-tone.ts` if the prior voice table is absent, then `scripts/add-internal-support.ts` against the target database. Both migrations are additive. The latter cancels pending automatic T3 replies.
2. Run `scripts/import-freshdesk-support.ts` with DATABASE_URL and FRESHDESK_DOMAIN/API_KEY. It bridges app/refund tickets and reads the official Freshdesk tickets/conversations API, persisting messages, private notes and attachments locally. It never writes Freshdesk or sends mail. Pagination continues to an empty page; any failure aborts with a nonzero exit. Imports are idempotent. Attachments are served through authenticated admin routes, never public URLs.
3. Configure `SUPPORT_TICKETING_BACKEND=internal` at cutover. This stops Freshdesk creation/escalation and switches queue, customer view and counts to local data. The operator authorized immediate cutover on 2026-10-16 while historical import continues. Imported counts therefore cover only the records already transferred. Keep the Freshdesk account available until history and operational validation are complete; subscription cancellation is a separate account action.
4. Keep `SUPPORT_EMAIL_MODE=pilot` and `SUPPORT_EMAIL_ALLOWED_RECIPIENTS=williamamade@gmail.com`. The restriction covers automatic AND manual sends and cannot be edited through voice/knowledge settings. Other inbound mail remains visible. The worker prioritizes allowed recipients so blocked production mail cannot starve the pilot.
5. Keep Railway cron at five minutes (its platform minimum). Each `support-email-worker` run makes five sequential calls at minute slots 0–4, giving minute-level polling. Each call times out at 55 seconds. The worker reads mode/allowlist from the app.

The importer uses the documented [Freshdesk API](https://developers.freshdesk.com/api/). Account archives/export-only records and unsupported attachment hosts cause a migration limitation rather than silent data loss; verify the import summary before cutover. Current source data remains intact.

The ordinary list endpoint caps results at 30,000 records. This account has more records, so a complete migration must use a full account export or partitioned queries; the script fails at the page limit rather than claiming completion. A full export including tickets, archived tickets, notes, attachments and contacts was requested on 2026-10-16 (job 24196619). Do not cancel Freshdesk access until the export has been imported and reconciled.

### Rollout checkpoint — 2026-10-16

- Production app deployment: `e4fb4fb7-9375-4c85-83f5-787fd722570f` (successful health check).
- Worker deployment: `359a74ea-551b-4c95-915e-85b05bf7d777` (five sequential minute slots observed in production logs).
- Backend: `internal`. Sending remains `pilot`, restricted to `williamamade@gmail.com`. Outbound mail only replies to an existing customer email thread.
- Transferred so far: 536 complete Freshdesk cases, 61 bridged app cases and 31 native email cases; 628 tickets, 1,032 messages and 7 locally stored attachments in total. No queued automatic T3 sends.
- Freshdesk reports 43,829 non-archived tickets in its full-history search. The bulk export job reached `SUCCESS` / 100%, including archived resources as requested. Its returned download URL is `https://beneonature.freshdesk.com/api/_/attachments/158026945652/download`.
- **History is incomplete:** the download requires an authenticated Freshworks administrator browser session. API-key access returns HTTP 403, and the available Safari session is signed out. The account for this API key is `william.amade@beneonature.com`. The user deferred historical migration. The export can be retrieved after login when this work resumes; per-ticket checkpoints are preserved. No import is running unattended.
- Validation: 363 tests passed, 7 unrelated opt-in tests skipped; TypeScript, changed-file lint and production build passed. UI screenshots in `../../entregaveis/suporte-interno` use isolated synthetic data.

## Email flow and provider contract

Incoming email → automatic ticket creation → AI or staff reply in the same provider thread. The admin panel does not create tickets manually or initiate new email threads. Only `email.reply` is supported, using the existing Jef callback and its existing acknowledgement contract. No provider changes are pending for this flow.

Local webapp/legacy records without a provider email thread cannot send email. They remain available for review and private notes. An incoming customer email can bind a unique sender/subject match to its real provider thread; ambiguous matches remain separate rather than guessing. Empty or local-only threads are blocked before the outbound callback. Staff can respond after a real incoming email supplies the thread.

The pilot recipient restriction applies to both AI and human replies. Keep `SUPPORT_EMAIL_MODE=pilot` and `SUPPORT_EMAIL_ALLOWED_RECIPIENTS=williamamade@gmail.com` until the user authorizes a general release.

Rejected T1/T2 replies are retained with the validation reason and regenerated within the existing three worker attempts. Each retry receives the previous rejection reason and reply. After three rejections, the job becomes `send/review`, the conversation remains agent-owned with `requiresHuman=false` and status `draft_needs_review`, and the amber reason is visible. No automatic send occurs, including in live mode. Staff may approve the draft explicitly or reply manually; approval and delivery retain the pilot/recipient gates. Three non-validation generation failures leave a `failed` prepare job and conversation status `generation_failed` for Retry. Configuration failures remain blocked.

To repair old T1/T2 handoffs, `scripts/reprocess-t1-t2-handoffs.ts` is DML-only and dry-run by default. With an explicitly supplied `DATABASE_URL`, run `npx tsx scripts/reprocess-t1-t2-handoffs.ts` to print counts and ticket numbers; add `--apply` to execute. The script never loads environment files. All selection/writes run in one transaction under an advisory lock, with the normal conversation lock and eligibility recheck before each write.

Selection requires an open T1/T2 human-required conversation and its latest incoming message. It excludes Freshdesk source/import metadata, latest `freshdesk-import:` messages, legacy/imported history, explicit **Staff took over**, and uncertain or currently processing jobs. Local/legacy threads qualify only for a bridged webapp ticket with a usable email and non-refund kind; historical bridge summaries are excluded. Apply returns ownership to the agent, clears the escalation reason, cancels queued/blocked/failed escalate/human_note jobs with `reprocess_t1_t2`, and inserts or resets the latest message's prepare job (attempts zero). It does not send mail; a subsequent worker follows the existing delivery gates. Review the dry-run output before applying. This script has not been run against a real database as part of this change.
