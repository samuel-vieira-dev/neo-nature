# Neo Nature — Customer Experience App (v0.2)

Post-purchase retention app for a DTC supplement brand: onboarding with a 3-phase
protocol, daily streaks, niche results tracking, subscriptions with honest
cancel, rewards, referrals, billing transparency and real web push — backed by
Postgres. External money/shipping integrations (BuyGoods, carriers, email) are
simulated until Phase 2 (see `../INTEGRACOES.md`).

## Local development

```bash
npm install
npm run env:gen     # creates .env.local with secrets + VAPID keys (once)
npm run db:start    # embedded Postgres on :5433 (keep running; no Docker needed)
npm run db:push     # apply schema        (new terminal)
npm run db:seed     # seed the 3 demo personas
npm run dev         # http://localhost:3000
```

Sign in with any email (the OTP code is shown on screen in demo mode) or use the
**persona quick-login** buttons:

| Persona | Scenario it demonstrates |
|---|---|
| **Michael** | Day 12 · renewal in 3 days · order in transit → billing/refill/subscription |
| **Jessica** | Day 28 · weight results logged · bottle almost empty → day-30 before/after, testimonial, referral |
| **Robert** | 3 days without a dose → churn rescue & pause flows |

**Demo Controls** (Profile tab): time travel ±days, run the retention jobs,
mark an order delivered, reset all data. Re-run `npm run db:seed` (or the Reset
button) if the personas drift — their dates are relative to seed time.

`npm test` runs the domain-logic unit tests (streak, points expiry, bottle
forecast, churn detection, tiers).

## Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | JWT session signing |
| `JOB_KEY` | Auth for the cron endpoint `/api/jobs/tick` |
| `DEMO_MODE` + `NEXT_PUBLIC_DEMO_MODE` | `true` enables persona login, on-screen OTP, demo panel |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Real web push |
| `ANTHROPIC_API_KEY` | Optional — AI FAQ answers (falls back to local search) |
| `FRESHDESK_DOMAIN` + `FRESHDESK_API_KEY` | Optional — push support tickets to Freshdesk. Without them, tickets stay local (`sync_status: local_only`). `FRESHDESK_DOMAIN` is just the subdomain, e.g. `neonature` for `neonature.freshdesk.com` |
| `RESEND_API_KEY` + `EMAIL_FROM` | Optional, legacy — send login codes by email via Resend. Customer login is now SMS-based (see Twilio below); this is unused by the current login flow but kept for reference. |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` | Optional — send customer login codes (4 digits) by SMS via Twilio's Messaging API. Without them, `/api/auth/request-code` returns the code in the response (`devCode`) so testers can still sign in. Local dev intentionally has no Twilio creds so tests never send real SMS. `TWILIO_FROM_NUMBER` is the US long code — always used for +1 destinations. |
| `TWILIO_MESSAGING_SERVICE_SID` | Recommended for international customers — a Twilio Messaging Service (`MG…`) whose sender pool holds the US number **and** an alphanumeric sender ("NeoNature"). Twilio then picks a sender the destination country accepts (the UK, for one, refuses SMS from US long codes — error 21612). When set it is tried first, before `TWILIO_FROM_NUMBER`. |
| `TWILIO_ALPHA_SENDER_ID` | Alternative to the Messaging Service: an alphanumeric sender (e.g. `NeoNature`, ≤11 chars) used directly for non-+1 destinations, and as the retry when the number is refused with 21612. Needs "Alphanumeric Sender ID" enabled on the Twilio account; some countries (Brazil, India…) require pre-registration. Never used for +1. |
| `TRACKING_URL_TEMPLATE` | Optional — customer-facing tracking link with a `{code}` placeholder (defaults to 17TRACK's public page). |
| `ADMIN_PASSWORD` | **Required** for `/admin-login` (replaces OTP for the admin panel). There is no fallback — if unset, admin login returns 503. Never commit the value; set it in the Railway variables and in your local `.env.local`. |

## Support tickets → Freshdesk (push-only)

The app creates every support/refund/billing ticket in Freshdesk via the REST v2
API (`src/server/freshdesk.ts`); the customer follows the thread over email.
Freshdesk is the system of record — the local `tickets` table is a mirror for the
"Your tickets" screen, with `sync_status`:

- `synced` — pushed to Freshdesk (`freshdesk_id` set)
- `local_only` — Freshdesk not configured (no env vars)
- `pending` — push failed (API/network); safe to reconcile later

To enable: create a Freshdesk account, grab the API key (Profile → below the
change-password box), and set `FRESHDESK_DOMAIN` + `FRESHDESK_API_KEY`. Start with
a **free trial account** to validate, then swap in the client's real credentials.

## Railway deploy

1. Add the **PostgreSQL** plugin; reference its `DATABASE_URL` in the web service.
2. Set the env vars above on the web service (Root Directory = `webapp`).
3. Apply schema + seed once: `npm run db:push && npm run db:seed` with the
   production `DATABASE_URL` (locally or via a one-off Railway shell).
4. Create a **cron service** (schedule: hourly) running:
   `curl -X POST "$APP_URL/api/jobs/tick?key=$JOB_KEY"`

## Architecture notes

- Next.js 16 fullstack — route handlers in `src/app/api/*`, gate in `src/proxy.ts`
- Drizzle schema in `src/db/schema.ts` (push workflow, no migration files yet)
- All date logic flows through `appNow(user)` (`src/server/time.ts`) so per-user
  **time travel** works everywhere — never call `new Date()` in domain logic
- Retention jobs in `src/server/jobs.ts`, idempotent via `job_runs` dedupe keys
- Catalog/protocols/kits/FAQ live in code (`src/lib/data.ts`), user data in Postgres

Deploy failed.
