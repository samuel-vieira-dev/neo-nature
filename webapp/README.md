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
