import {
  pgTable,
  text,
  integer,
  serial,
  boolean,
  timestamp,
  date,
  jsonb,
  numeric,
  uniqueIndex,
  index,
  pgSequence,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Neo Nature v0.3 schema — "Clareza 45+" redesign.
// Catalog and goals live in code (src/lib/data.ts) — only user data lives
// here. All "money" flows are simulated (BuyGoods integration is Phase 2).
// ---------------------------------------------------------------------------

// -------- canonical customer identity (Customer 360) --------
// One row per real-world customer, unifying BuyGoods/Konnektive orders and the
// app account. Only IDENTITY is materialized here — aggregates (LTV, counts,
// platforms) stay derived at read time in crm.ts, so there is a single source
// of truth for them. `customer_id` on orders/users is sticky: set once by
// src/server/customer-identity.ts and never reassigned automatically; fixing a
// bad link is a manual operation via `merged_into_id` (tombstone: readers
// follow the pointer, writers keep appending to the surviving row).
export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(), // uuid
    // Lowercased. Null for phone-only clusters (SMS signup, no order email).
    primaryEmail: text("primary_email").unique(),
    // E.164. NOT unique — two email-keyed customers can legitimately share a
    // phone today (family orders); email is the strong key, phone the weak one.
    primaryPhone: text("primary_phone"),
    name: text("name").notNull().default(""), // snapshot of the latest customerName seen
    mergedIntoId: text("merged_into_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("customers_phone").on(t.primaryPhone)]
);

export const users = pgTable("users", {
  id: text("id").primaryKey(), // slug for personas ("michael"), uuid otherwise
  // Customers now sign in with a phone (SMS OTP); email is kept for legacy
  // accounts + Freshdesk/CRM lookups but is nullable for phone-only signups.
  email: text("email").unique(),
  phone: text("phone").unique(), // E.164, e.g. "+15551234567"
  // Canonical customer — see the customers table above. Sticky once set.
  customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
  name: text("name").notNull().default(""),
  fullName: text("full_name").notNull().default(""),
  niche: text("niche"), // mens_health | weight_loss | diabetes
  motivation: text("motivation"), // captured at onboarding, used in rescue flow
  address: text("address").notNull().default(""),
  demoDayOffset: integer("demo_day_offset").notNull().default(0), // time travel
  onboardedAt: timestamp("onboarded_at", { withTimezone: true, mode: "date" }),
  // Set when a first-time customer whose order has NOT arrived yet finished the
  // lightweight pre-arrival setup (install + notifications) instead of the full
  // onboarding. They get the app (home shows package tracking) while
  // onboardedAt stays null; the full setup runs once the package is in hand.
  awaitingDeliveryAt: timestamp("awaiting_delivery_at", { withTimezone: true, mode: "date" }),
  // Last time the customer themselves signed in (OTP/demo login). Stays null
  // for accounts the admin merely provisioned to preview a lead, which is what
  // the CRM's "App" tag keys on — see crm.ts.
  lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
  churnFlag: boolean("churn_flag").notNull().default(false),
  freezes: integer("freezes").notNull().default(2),
  bestStreak: integer("best_streak").notNull().default(0),
  prefs: jsonb("prefs")
    .$type<{ doseReminder: boolean; orderUpdates: boolean; newContent: boolean; offers: boolean }>()
    .notNull()
    .default({ doseReminder: true, orderUpdates: true, newContent: true, offers: false }),
  memberSince: timestamp("member_since", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const otpCodes = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  // Login codes are keyed by phone now (SMS); email kept nullable for any
  // still-pending legacy flows.
  email: text("email"),
  phone: text("phone"),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
});

// -------- adherence --------

export const doseLogs = pgTable(
  "dose_logs",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    day: date("day").notNull(), // the user-local "app day" (respects time travel)
    takenAt: timestamp("taken_at", { withTimezone: true, mode: "date" }).notNull(),
    source: text("source").notNull().default("checkin"), // checkin | recover | onboarding
    photoId: integer("photo_id"),
  },
  (t) => [uniqueIndex("dose_user_day").on(t.userId, t.day), index("dose_user").on(t.userId)]
);

export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  time: text("time").notNull(), // "08:00"
  habitAnchor: text("habit_anchor"), // "with your morning coffee"
  enabled: boolean("enabled").notNull().default(true),
});

export const bottles = pgTable("bottles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  capsules: integer("capsules").notNull(),
  dosePerDay: integer("dose_per_day").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true, mode: "date" }).notNull(),
  active: boolean("active").notNull().default(true),
});

// -------- commerce --------
// Two independent order feeds write here, and they carry different orders (not
// the same order twice): BuyGoods IPN (src/server/buygoods.ts) and Konnektive
// (src/server/konnektive.ts). `source` says which one owns a row; each feed
// keys idempotency off its own id column and never touches the other's rows.

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(), // "bg-<order_id_global>" or "kn-<clientOrderId>"
    source: text("source").notNull().default("buygoods"), // buygoods | konnektive
    buygoodsOrderId: text("buygoods_order_id").unique(), // order_id_global (idempotency key)
    // Konnektive's clientOrderId — the hash ("F5A8CD676F"). Deliberately not
    // `orderId`, which is the hash on the proxy feed but the numeric id on the
    // direct feed; clientOrderId is the one field that means the same thing in
    // both. The numeric id lands in `number` for display.
    konnektiveOrderId: text("konnektive_order_id").unique(),
    // orders can arrive before the customer signs up — matched by email at read time
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    // Canonical customer — see the customers table above. Sticky once set.
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    // BuyGoods' own customer identity, used as a third linking key beside
    // phone/email (survives a mistyped checkout email). The numeric user_id is
    // scoped PER BuyGoods account and ranges overlap between accounts, so only
    // the (account_id, user_id) PAIR identifies a customer — never match on
    // user_id alone. Null on Konnektive orders (that feed has no customer id).
    buygoodsAccountId: text("buygoods_account_id"),
    buygoodsUserId: text("buygoods_user_id"),
    email: text("email").notNull().default(""),
    // Best-effort E.164 normalization of customer_phone (see src/lib/phone-format.ts)
    // — powers phone-based order linking for SMS-only accounts.
    customerPhoneE164: text("customer_phone_e164"),
    number: text("number").notNull(), // human order id (order_id)
    placedAt: timestamp("placed_at", { withTimezone: true, mode: "date" }).notNull(),
    status: text("status").notNull(), // confirmed | shipped | canceled | refunded
    total: numeric("total", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    shippingStatus: text("shipping_status"), // BuyGoods human text, e.g. "Shipped on 27 Feb, 2023"
    // Carrier tracking number (BuyGoods field: shipping_tracking_id). Sent on
    // fulfillment despite what earlier comments here claimed — see buygoods.ts.
    shippingTrackingId: text("shipping_tracking_id"),
    // Pre-existing production column, added outside this codebase (no history
    // in schema.ts) — presumably an external Track17 shipment-tracking
    // integration set up directly against the DB. Declared here so `db:push`
    // stops proposing to drop it.
    track17Registered: boolean("track17_registered").default(false),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true, mode: "date" }),
    // Stamped the first time we observe the transition into that state (webhook
    // receipt time, not necessarily the exact upstream event time) — never
    // overwritten once set. Null on backfill replays of history we can't date.
    refundedAt: timestamp("refunded_at", { withTimezone: true, mode: "date" }),
    chargebackAt: timestamp("chargeback_at", { withTimezone: true, mode: "date" }),
    // What the feed reported was actually returned — refunds are often partial
    // (a customer keeps part of the order), so this can be less than `total`.
    // Null when the feed didn't report an amount, NOT when it's a full refund —
    // never assume full total from a missing value.
    refundAmount: numeric("refund_amount", { precision: 10, scale: 2 }),
    chargebackAmount: numeric("chargeback_amount", { precision: 10, scale: 2 }),
    address: text("address").notNull().default(""),
    // The order's headline product, denormalized from order_items so the CRM
    // and exports can read/filter it without a join. BuyGoods orders are always
    // a single product; a multi-item Konnektive order records its FIRST item
    // here, so order_items stays the source of truth for the full contents.
    productName: text("product_name").notNull().default(""),
    productCodename: text("product_codename").notNull().default(""),
    // BuyGoods' flag_upsell: this row is an upsell/downsell booked in the same
    // checkout session as a main order (BuyGoods creates a separate order per
    // funnel step). The customer sees it folded into the main order — see
    // src/server/order-groups.ts. Null when the feed didn't say (pre-2026-08-21
    // rows until backfilled; Konnektive), in which case the u*/d* codename
    // prefix is the fallback signal.
    upsellFlag: boolean("upsell_flag"),
    // customer + attribution (from the BuyGoods IPN) — powers the admin CRM
    customerName: text("customer_name").notNull().default(""),
    customerPhone: text("customer_phone"),
    saleOrigin: text("sale_origin").notNull().default("Direct"), // affiliate || traffic_source || funnel || Direct
    affiliate: text("affiliate"), // aff_name
    trafficSource: text("traffic_source"),
    funnel: text("funnel"), // funnel_codename
    subid: text("subid"),
    paymentMethod: text("payment_method"),
    trackingSteps: jsonb("tracking_steps")
      .$type<{ label: string; detail: string; date: string; done: boolean; current?: boolean }[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_email").on(t.email),
    index("orders_origin").on(t.saleOrigin),
    index("orders_phone").on(t.customerPhoneE164),
    index("orders_bg_user").on(t.buygoodsAccountId, t.buygoodsUserId),
    index("orders_customer").on(t.customerId),
  ]
);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productCodename: text("product_codename").notNull().default(""),
  productName: text("product_name").notNull().default(""),
  sku: text("sku"),
  thumbnailUrl: text("thumbnail_url"),
  qty: integer("qty").notNull().default(1),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  cardDescriptor: text("card_descriptor").notNull(), // exact name on the card statement
  status: text("status").notNull(), // paid | upcoming | refunded
  chargedAt: timestamp("charged_at", { withTimezone: true, mode: "date" }).notNull(),
  orderNumber: text("order_number"),
});

export const photos = pgTable("photos", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // first_dose | progress | ticket
  mime: text("mime").notNull().default("image/jpeg"),
  dataBase64: text("data_base64").notNull(), // client-downscaled ≤800px; S3/R2 in Phase 2
  takenAt: timestamp("taken_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// -------- messaging --------

export const banners = pgTable("banners", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  ctaLabel: text("cta_label"),
  ctaUrl: text("cta_url"),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    icon: text("icon").notNull().default("flame"), // flame | package | book | tag
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("notif_user").on(t.userId)]
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// -------- support --------

// Ticket ids are minted from this sequence as "T-" || nextval, so they are
// unique across ALL users (the id is the global primary key). It starts at 2900
// — above the highest value the old random "T-2200..2899" scheme could produce
// — so a freshly minted id can never collide with a legacy row.
export const ticketIdSeq = pgSequence("ticket_id_seq", { startWith: 2900 });

export const tickets = pgTable("tickets", {
  id: text("id").primaryKey(), // "T-2901" — see ticketIdSeq
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  orderNumber: text("order_number").notNull().default("—"),
  kind: text("kind").notNull().default("support"), // support | refund | billing
  status: text("status").notNull().default("open"), // open | in_review | resolved
  lastMessage: text("last_message").notNull().default(""),
  // Freshdesk mirror (push-only): local row is the app's view, Freshdesk is the
  // system of record. syncStatus tracks whether the push to Freshdesk succeeded.
  email: text("email").notNull().default(""), // requester email snapshot (Freshdesk keys on this)
  freshdeskId: integer("freshdesk_id"), // Freshdesk ticket id once created
  syncStatus: text("sync_status").notNull().default("pending"), // pending | synced | local_only
  // Idempotency key minted by the client, one per submission intent (not per
  // tap). Repeated taps on a slow submit reuse it, so the unique index turns
  // duplicate POSTs into a no-op that returns the ticket already created —
  // nothing extra reaches Freshdesk. Nullable: older clients simply don't dedupe.
  clientRequestId: text("client_request_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// -------- jobs bookkeeping (idempotency for /api/jobs/tick) --------

export const jobRuns = pgTable("job_runs", {
  id: serial("id").primaryKey(),
  dedupeKey: text("dedupe_key").notNull().unique(), // e.g. "billing-t3:12:2026-07-03"
  kind: text("kind").notNull(),
  ranAt: timestamp("ran_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// -------- inbound webhooks (raw capture, pre-integration) --------

/** Raw capture of every hit to /webhook-buygoods-info and /webhook-konnektive — inspect these to design the real integrations */
export const webhookLogs = pgTable("webhook_logs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull().default("buygoods"),
  method: text("method").notNull(),
  contentType: text("content_type"),
  headers: jsonb("headers").$type<Record<string, string>>().notNull().default({}),
  query: jsonb("query").$type<Record<string, string>>().notNull().default({}),
  body: text("body").notNull().default(""),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// Audit trail for sensitive admin actions (e.g. impersonating a customer).
export const adminActionLogs = pgTable("admin_action_logs", {
  id: serial("id").primaryKey(),
  adminUserId: text("admin_user_id").notNull(),
  action: text("action").notNull(), // e.g. "impersonate"
  targetUserId: text("target_user_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type Customer = typeof customers.$inferSelect;
export type User = typeof users.$inferSelect;
export type DoseLog = typeof doseLogs.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type Bottle = typeof bottles.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type AppNotification = typeof notifications.$inferSelect;
export type Banner = typeof banners.$inferSelect;
export type WebhookLog = typeof webhookLogs.$inferSelect;
