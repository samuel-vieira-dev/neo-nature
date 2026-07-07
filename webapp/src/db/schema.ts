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
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Neo Nature v0.2 schema.
// Catalog, protocols and kits live in code (src/lib/data.ts) — only user data
// lives here. All "money" flows are simulated (BuyGoods integration is Phase 2).
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id").primaryKey(), // slug for personas ("michael"), uuid otherwise
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  fullName: text("full_name").notNull().default(""),
  niche: text("niche"), // mens_health | weight_loss | diabetes
  motivation: text("motivation"), // captured at onboarding, used in rescue flow
  address: text("address").notNull().default(""),
  demoDayOffset: integer("demo_day_offset").notNull().default(0), // time travel
  onboardedAt: timestamp("onboarded_at", { withTimezone: true, mode: "date" }),
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
  email: text("email").notNull(),
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

// -------- commerce (simulated; BuyGoods postback replaces this in Phase 2) --------

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  placedAt: timestamp("placed_at", { withTimezone: true, mode: "date" }).notNull(),
  status: text("status").notNull(), // processing | in_transit | delivered
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  eta: text("eta"),
  carrier: text("carrier"),
  trackingNumber: text("tracking_number"),
  address: text("address").notNull().default(""),
  trackingSteps: jsonb("tracking_steps")
    .$type<{ label: string; detail: string; date: string; done: boolean; current?: boolean }[]>()
    .notNull()
    .default([]),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  qty: integer("qty").notNull().default(1),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("product"), // product | kit
  refId: text("ref_id").notNull(), // productId or kitId
  status: text("status").notNull().default("active"), // active | paused | canceled
  priceMonthly: numeric("price_monthly", { precision: 10, scale: 2 }).notNull(),
  discountPct: integer("discount_pct").notNull().default(15),
  nextBillingAt: timestamp("next_billing_at", { withTimezone: true, mode: "date" }),
  monthsActive: integer("months_active").notNull().default(0),
  skipsUsed: integer("skips_used").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  pausedUntil: timestamp("paused_until", { withTimezone: true, mode: "date" }),
  canceledAt: timestamp("canceled_at", { withTimezone: true, mode: "date" }),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subscriptionId: integer("subscription_id"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  cardDescriptor: text("card_descriptor").notNull(), // exact name on the card statement
  status: text("status").notNull(), // paid | upcoming | refunded
  chargedAt: timestamp("charged_at", { withTimezone: true, mode: "date" }).notNull(),
  orderNumber: text("order_number"),
});

// -------- results --------

export const resultsEntries = pgTable(
  "results_entries",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // weight | waist | ed_score | glucose_am | glucose_pm | victory
    valueNum: numeric("value_num", { precision: 10, scale: 2 }),
    valueText: text("value_text"),
    photoId: integer("photo_id"),
    day: date("day").notNull(),
    loggedAt: timestamp("logged_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [index("results_user_type").on(t.userId, t.type)]
);

export const photos = pgTable("photos", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // first_dose | progress | ticket
  mime: text("mime").notNull().default("image/jpeg"),
  dataBase64: text("data_base64").notNull(), // client-downscaled ≤800px; S3/R2 in Phase 2
  takenAt: timestamp("taken_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const testimonials = pgTable("testimonials", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  consent: boolean("consent").notNull().default(false),
  photoId: integer("photo_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// -------- loyalty --------

export const pointsLedger = pgTable(
  "points_ledger",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("points_user").on(t.userId)]
);

export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  invitedCount: integer("invited_count").notNull().default(0),
  convertedCount: integer("converted_count").notNull().default(0),
});

// -------- messaging --------

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

export const tickets = pgTable("tickets", {
  id: text("id").primaryKey(), // "T-2201"
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  orderNumber: text("order_number").notNull().default("—"),
  kind: text("kind").notNull().default("support"), // support | refund | billing
  status: text("status").notNull().default("open"), // open | in_review | resolved
  lastMessage: text("last_message").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// -------- content --------

export const contentProgress = pgTable(
  "content_progress",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("content_user_slug").on(t.userId, t.slug)]
);

// -------- jobs bookkeeping (idempotency for /api/jobs/tick) --------

export const jobRuns = pgTable("job_runs", {
  id: serial("id").primaryKey(),
  dedupeKey: text("dedupe_key").notNull().unique(), // e.g. "billing-t3:12:2026-07-03"
  kind: text("kind").notNull(),
  ranAt: timestamp("ran_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type DoseLog = typeof doseLogs.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type Bottle = typeof bottles.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type ResultEntry = typeof resultsEntries.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type AppNotification = typeof notifications.$inferSelect;
