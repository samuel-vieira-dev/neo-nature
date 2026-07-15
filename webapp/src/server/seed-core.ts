/* Shared seed logic — used by scripts/seed.ts (CLI) and /api/demo/reset (demo panel). */
import { db, rawSql as sql } from "@/db";
import * as s from "@/db/schema";

const DAY = 86400000;
const d = (days: number) => new Date(Date.now() + days * DAY);
const day = (days: number) => d(days).toISOString().slice(0, 10);
const fmt = (days: number) =>
  d(days).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export async function seedAll() {
  console.log("[seed] resetting tables …");
  await sql`TRUNCATE TABLE users, otp_codes, dose_logs, reminders, bottles, orders, order_items,
    invoices, photos, notifications, push_subscriptions, tickets, banners, job_runs CASCADE`;

  // ------------------------------------------------------------------ users
  await db.insert(s.users).values([
    {
      id: "michael",
      email: "michael@demo.neonature.app",
      name: "Michael",
      fullName: "Michael Brooks",
      niche: "mens_health",
      motivation: "Feel like myself again — confident and full of energy",
      address: "2847 Maplewood Ave, Austin, TX 78704",
      onboardedAt: d(-12),
      memberSince: d(-90),
      bestStreak: 21,
      freezes: 2,
    },
    {
      id: "jessica",
      email: "jessica@demo.neonature.app",
      name: "Jessica",
      fullName: "Jessica Miller",
      niche: "weight_loss",
      motivation: "Fit back into my favorite jeans by my sister's wedding",
      address: "1509 Birchwood Ln, Nashville, TN 37209",
      onboardedAt: d(-28),
      memberSince: d(-40),
      bestStreak: 27,
      freezes: 2,
    },
    {
      id: "robert",
      email: "robert@demo.neonature.app",
      name: "Robert",
      fullName: "Robert Chen",
      niche: "diabetes",
      motivation: "Keep my morning glucose steady so I can stop worrying about it",
      address: "88 Harborview Dr, San Diego, CA 92109",
      onboardedAt: d(-20),
      memberSince: d(-20),
      bestStreak: 17,
      freezes: 1,
      churnFlag: true,
    },
  ]);

  // ------------------------------------------------------------------ doses
  const doses: (typeof s.doseLogs.$inferInsert)[] = [];
  for (let i = 11; i >= 1; i--) doses.push({ userId: "michael", productId: "heroup", day: day(-i), takenAt: d(-i) });
  for (let i = 27; i >= 1; i--) doses.push({ userId: "jessica", productId: "igniteburn", day: day(-i), takenAt: d(-i) });
  for (let i = 20; i >= 3; i--) doses.push({ userId: "robert", productId: "glucoease", day: day(-i), takenAt: d(-i) });
  await db.insert(s.doseLogs).values(doses);

  // -------------------------------------------------------------- reminders
  await db.insert(s.reminders).values([
    { userId: "michael", time: "08:00", habitAnchor: "with your morning coffee" },
    { userId: "michael", time: "20:00", habitAnchor: "after dinner" },
    { userId: "jessica", time: "07:30", habitAnchor: "before your morning walk" },
    { userId: "robert", time: "08:30", habitAnchor: "with breakfast" },
  ]);

  // ---------------------------------------------------------------- bottles
  await db.insert(s.bottles).values([
    { userId: "michael", productId: "heroup", capsules: 60, dosePerDay: 2, openedAt: d(-12) },
    { userId: "jessica", productId: "igniteburn", capsules: 60, dosePerDay: 2, openedAt: d(-28) }, // ~2 days left → reorder banner
    { userId: "robert", productId: "glucoease", capsules: 60, dosePerDay: 2, openedAt: d(-20) },
  ]);

  // ----------------------------------------------------------------- orders
  const steps = {
    inTransit: [
      { label: "Order confirmed", detail: "We received your order", date: fmt(-10), done: true },
      { label: "Preparing your package", detail: "Fulfillment center — Dallas, TX", date: fmt(-9), done: true },
      { label: "Shipped", detail: "Handed to USPS", date: fmt(-8), done: true },
      { label: "In transit", detail: "Last scan: Waco, TX distribution center", date: fmt(-1), done: true, current: true },
      { label: "Out for delivery", detail: "", date: "", done: false },
      { label: "Delivered", detail: "", date: "", done: false },
    ],
    delivered: (offset: number, carrier: string) => [
      { label: "Order confirmed", detail: "We received your order", date: fmt(offset), done: true },
      { label: "Preparing your package", detail: "Fulfillment center — Dallas, TX", date: fmt(offset), done: true },
      { label: "Shipped", detail: `Handed to ${carrier}`, date: fmt(offset + 1), done: true },
      { label: "In transit", detail: "", date: fmt(offset + 2), done: true },
      { label: "Out for delivery", detail: "On the truck", date: fmt(offset + 4), done: true },
      { label: "Delivered", detail: "Left at front door", date: fmt(offset + 4), done: true },
    ],
  };

  await db.insert(s.orders).values([
    {
      id: "m-o1", userId: "michael", number: "NN-10482", placedAt: d(-10), status: "in_transit", total: "187.00",
      eta: fmt(3), carrier: "USPS", trackingNumber: "9400 1102 3387 4512 9981 02",
      address: "2847 Maplewood Ave, Austin, TX 78704", trackingSteps: steps.inTransit,
    },
    {
      id: "m-o2", userId: "michael", number: "NN-09917", placedAt: d(-45), status: "delivered", total: "59.00",
      carrier: "UPS", trackingNumber: "1Z 999 AA1 01 2345 6784",
      address: "2847 Maplewood Ave, Austin, TX 78704", trackingSteps: steps.delivered(-45, "UPS"),
    },
    {
      id: "m-o3", userId: "michael", number: "NN-09312", placedAt: d(-88), status: "delivered", total: "69.00",
      carrier: "USPS", trackingNumber: "9400 1102 3387 1120 4471 88",
      address: "2847 Maplewood Ave, Austin, TX 78704", trackingSteps: steps.delivered(-88, "USPS"),
    },
    {
      id: "j-o1", userId: "jessica", number: "NN-10077", placedAt: d(-29), status: "delivered", total: "64.00",
      carrier: "USPS", trackingNumber: "9400 1102 3387 5566 1220 14",
      address: "1509 Birchwood Ln, Nashville, TN 37209", trackingSteps: steps.delivered(-29, "USPS"),
    },
    {
      id: "r-o1", userId: "robert", number: "NN-10241", placedAt: d(-21), status: "delivered", total: "55.00",
      carrier: "FedEx", trackingNumber: "7489 3320 1145",
      address: "88 Harborview Dr, San Diego, CA 92109", trackingSteps: steps.delivered(-21, "FedEx"),
    },
  ]);

  await db.insert(s.orderItems).values([
    { orderId: "m-o1", productId: "heroup", qty: 2, price: "138.00" },
    { orderId: "m-o1", productId: "igniteburn", qty: 1, price: "49.00" },
    { orderId: "m-o2", productId: "verdagreens", qty: 1, price: "59.00" },
    { orderId: "m-o3", productId: "heroup", qty: 1, price: "69.00" },
    { orderId: "j-o1", productId: "igniteburn", qty: 1, price: "64.00" },
    { orderId: "r-o1", productId: "glucoease", qty: 1, price: "55.00" },
  ]);

  // --------------------------------------------------------------- invoices
  // Every order produces a paid charge — no subscriptions in v0.3.
  await db.insert(s.invoices).values([
    { userId: "michael", amount: "187.00", cardDescriptor: "NEONATURE*ORDER 855-201-4437", status: "paid", chargedAt: d(-10), orderNumber: "NN-10482" },
    { userId: "michael", amount: "59.00", cardDescriptor: "NEONATURE*ORDER 855-201-4437", status: "paid", chargedAt: d(-45), orderNumber: "NN-09917" },
    { userId: "michael", amount: "69.00", cardDescriptor: "NEONATURE*ORDER 855-201-4437", status: "paid", chargedAt: d(-88), orderNumber: "NN-09312" },
    { userId: "jessica", amount: "64.00", cardDescriptor: "NEONATURE*ORDER 855-201-4437", status: "paid", chargedAt: d(-29), orderNumber: "NN-10077" },
    { userId: "robert", amount: "55.00", cardDescriptor: "NEONATURE*ORDER 855-201-4437", status: "paid", chargedAt: d(-21), orderNumber: "NN-10241" },
  ]);

  // ---------------------------------------------------------- notifications
  await db.insert(s.notifications).values([
    { userId: "michael", title: "Don't lose your streak! 🔥", body: "You're on an 11-day streak. Take your HeroUp and check in.", icon: "flame", createdAt: d(0) },
    { userId: "michael", title: "Your package is moving 📦", body: `Order NN-10482 left the Waco, TX facility. ETA ${fmt(3)}.`, icon: "package", createdAt: d(0) },
    { userId: "jessica", title: "Your bottle is running low", body: "About 2 days of IgniteBurn left — reorder in one tap.", icon: "package", createdAt: d(0) },
    { userId: "jessica", title: "27 days strong 🔥", body: "You're one of our most consistent members this month. Keep it up!", icon: "flame", createdAt: d(-1), readAt: d(-1) },
    { userId: "robert", title: "We miss you, Robert 💚", body: "It's been 3 days. Your morning readings were improving — let's not lose that.", icon: "flame", createdAt: d(0) },
  ]);

  // ---------------------------------------------------------------- tickets
  await db.insert(s.tickets).values([
    {
      id: "T-2201", userId: "michael", subject: "Package arrived with a dented bottle",
      orderNumber: "NN-09917", status: "resolved", kind: "support", createdAt: d(-40),
      lastMessage: "We shipped a free replacement — so sorry about that! It arrived 5 days later.",
    },
  ]);

  // ---------------------------------------------------------------- banners
  await db.insert(s.banners).values([
    { title: "Free shipping this week 🚚", body: "Every order over $0 ships free across the US — no code needed.", ctaLabel: "Shop now", ctaUrl: "/shop", active: true },
    { title: "New: GlucoEase restocked", body: "Our blood sugar support formula is back in stock.", ctaLabel: "View product", ctaUrl: "/shop/glucoease", active: false },
    { title: "60-day guarantee, always", body: "Not right for you? Get a full refund within 60 days, no questions asked.", ctaLabel: "Learn more", ctaUrl: "/support", active: false },
  ]);

  console.log("[seed] done — personas: michael, jessica, robert");
}
