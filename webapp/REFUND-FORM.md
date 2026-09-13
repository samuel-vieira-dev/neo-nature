# Native refund form

The “No thanks — continue with my refund” button in `/support/new` opens the native form imported from [Tally](https://tally.so/r/XxoWPY). Its 20 questions, four photo uploads, video, consent and conditional routes are defined in `src/lib/refund/default-form.json`.

## Deployment

Apply the additive migration **before** deploying the application changes, from `webapp`:

```sh
npx tsx --env-file=.env.production scripts/add-refund-form.ts
```

Use `.env.local` for a development database. The migration is idempotent and preserves existing tickets and saved form definitions. It creates the baseline version 0 once; later code changes cannot replace this stored version. No external storage credentials or new dependencies are required.

## Administration

`/admin/refunds` has two tabs:

- **Requests:** paginated submissions, review-status filter, original answers and authenticated attachment downloads. Staff with `tickets:write` can update the review status and internal notes. These review fields do not execute a refund, change an order or change Freshdesk ticket status.
- **Edit form:** administrators with `refund-form:write` can change copy, labels, option text, required fields, minimum lengths and existing conditional destinations. Saving publishes an immutable new version. Concurrent edits are rejected rather than silently overwritten. Adding/removing field types and creating new rules is a code change.

Submissions store their form version, definition and validated answers in the same ticket insert used for deduplication. Only answers on the actual completed branch are accepted. The support ticket is saved locally before the existing Freshdesk integration is attempted. Freshdesk receives the answers; attachments stay private in the webapp admin. Audit logs record form publications and review updates.

## Compatibility and upload limits

- Order numbers accept alphanumeric codes used by BuyGoods and Konnektive, rather than Tally’s numeric-only restriction.
- The undelivered-product, declined-terms and short-use branches retain Tally’s behavior: they display guidance without submitting a refund. The app explicitly tells the customer that nothing was submitted and offers the support phone number.
- Each attachment supports up to 20 MB, including video. Accepted formats: JPG, PNG, WebP, HEIC/HEIF, MP4, MOV and WebM. Uploads are stored in PostgreSQL, matching the existing photo-storage approach. Larger media workloads should move to private object storage.
- Uploads are immutable and scoped to the authenticated customer, submission intent and field. There is a 200 MB per-customer rolling daily limit and a rate limit of 30 attempts/hour. Abandoned uploads older than seven days are removed on the customer’s next upload; attachments referenced by submitted tickets are preserved.
- The original Tally copy includes literal “support email” placeholders. They remain editable in the admin; the app also provides the existing working support phone number on terminal guidance screens.

## Validation

```sh
npm test
npx tsc --noEmit
npm run build
```

The form unit tests cover full refund and retained branches, all blocked branches, required uploads, field validation, alphanumeric orders, removal of skipped answers and invalid admin navigation. Local integration verification additionally covered authenticated routes, attachment ownership/downloads, concurrent duplicate submissions, reviews, version preservation and conflicting admin updates. Browser verification covered the trigger, prefilled fields, validation and admin request/editor screens.
