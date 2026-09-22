# Konnektive refunds in the admin panel

Admin → Customers → customer → Purchases shows Refund tools only on Konnektive orders. Admin and CS both have `orders:refund`. The API checks the order source again, so changing the browser request cannot refund BuyGoods or an unknown origin. Each add-on order is refunded separately.

## Production setup

Run the additive database migration against the target database before deployment:

```sh
npx tsx --env-file=.env.local scripts/add-order-refunds.ts
```

Set these **server-only** Railway variables:

```dotenv
KONNEKTIVE_API_LOGIN_ID=<API user>
KONNEKTIVE_API_PASSWORD=<API password>
KONNEKTIVE_REFUND_MODE=live
```

The Railway service has three static outbound IPv4 addresses in US West: `162.220.232.251`, `152.55.176.240`, `152.55.177.181`. All three need Konnektive allowlisting. The assigned pool changes if the service region changes. Keep outbound IPv6 disabled unless the Konnektive allowlist also supports it. Static IPs do not guarantee API uptime.

The real endpoint for a specific order is [Refund Order](https://apidocs.konnektive.com/#39b91d4d-ff36-430d-b201-0974bfcb05b4), `POST /order/refund/`. The originally supplied [Refund Purchase](https://apidocs.konnektive.com/#35d9553c-58c2-457a-b5bd-24cb23ba083d) endpoint targets the latest continuity billing and is unsuitable for an order selected in the panel.

The panel reads `/order/query/` to obtain the current refundable balance and checks the order ID and currency before refunding. Full refund sends `fullRefund=true`; partial refund sends `refundAmount`. It never approves QA, cancels an order, cancels a subscription or changes fulfillment. Pending orders cannot be refunded. The interface tells the operator to confirm the result in the Konnektive panel.

Before the outbound refund request, the app persists a `processing` record and audit event. Concurrent requests for the same local order are serialized through a row lock. A repeated request UUID returns the stored result without another Konnektive call. A timeout, invalid response or unverified balance after an accepted refund becomes `unknown` and blocks further refunds on that order until an administrator reconciles the attempt manually. Do not retry with a new request ID in that state. The local commerce record is not rewritten from the refund request; Konnektive remains the source of truth and the normal ingestion path updates local order data when available.

The ledger is separate from the old mock simulations. To test without processing refunds, use `KONNEKTIVE_REFUND_MODE=mock` and optionally `KONNEKTIVE_REFUND_MOCK_RESULT=success|decline|timeout`. Missing mode disables processing. Mock mode does not call Konnektive.

## API test evidence — 2026-09-22

From the Railway runtime, HTTPS egress used `152.55.177.181`, one of the fixed IPs. Order Import created synthetic order `30F733F904` for USD 10.00 with official `TESTCARD`, QA hold and no additional club item. Query Order confirmed the test card and marker `NN-REFUND-TEST-20260922-A`. A partial refund before QA approval failed because there was no successful transaction. QA approval then captured the test order. Refund Order returned SUCCESS for USD 3.00, with Query Order showing USD 7.00 remaining; `fullRefund=true` returned SUCCESS and a final query showed USD 0.00 remaining. This tests Konnektive's test card behavior, not real processor settlement.

The supplied `campaignId=37`, `product1_id=31` mapped to **GlycoFree - 3 Bottles**, not the Vigor Fuel checkout offer. Confirm product IDs against the campaign before making new test orders.

**Important partial-refund detail:** Query Order reported `orderStatus=REFUNDED` even after the USD 3.00 partial. Classify full versus partial using `refundRemaining` and transactions, not that status alone. Test-card orders do not export via webhooks, so verification used Query Order directly.

## Validation

```sh
npm test -- src/server/permissions.test.ts src/server/order-refund-policy.test.ts src/app/api/admin/orders/\[id\]/refunds/route.test.ts
RUN_REFUND_DB_TESTS=1 npm test -- src/server/order-refunds.integration.test.ts
npx tsc --noEmit
```

The database integration suite uses a disposable embedded PostgreSQL cluster; it never uses production credentials. The production migration was applied before deployment and the table was confirmed empty at creation.
