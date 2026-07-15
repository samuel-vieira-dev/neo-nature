import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, doseLogs, reminders, bottles, jobRuns, type User } from "@/db/schema";
import { appNow, userToday } from "./time";
import { bottleForecast, daysWithoutDose } from "./domain";
import { notifyUser } from "./push";
import { productById } from "@/lib/data";

/**
 * The heart of retention automation. Runs hourly via Railway cron (and on
 * demand from the demo panel). Every action is idempotent through job_runs
 * dedupe keys, so re-running is always safe.
 *
 * Routines:
 *  1. dose reminders at each user's chosen times (habit-anchored copy)
 *  2. churn detection (2+ days without a dose → flag + win-back nudge)
 *  3. refill nudge when the bottle is running low
 */
export async function runJobs(): Promise<string[]> {
  const actions: string[] = [];
  const allUsers = await db.query.users.findMany();

  for (const user of allUsers) {
    await doseReminders(user, actions);
    await churnDetection(user, actions);
    await refillNudge(user, actions);
  }

  return actions;
}

/** returns true when this dedupe key hasn't run yet (and records it) */
async function once(dedupeKey: string, kind: string): Promise<boolean> {
  const inserted = await db
    .insert(jobRuns)
    .values({ dedupeKey, kind })
    .onConflictDoNothing()
    .returning();
  return inserted.length > 0;
}

async function lastDoseDayOf(userId: string): Promise<string | null> {
  const last = await db.query.doseLogs.findFirst({
    where: eq(doseLogs.userId, userId),
    orderBy: [desc(doseLogs.day)],
    columns: { day: true },
  });
  return last?.day ?? null;
}

async function doseReminders(user: User, actions: string[]) {
  if (!user.prefs.doseReminder) return;
  const today = userToday(user);
  const now = appNow(user);
  const hhmm = now.toISOString().slice(11, 16);

  // already checked in today? no nagging.
  const todayLog = await db.query.doseLogs.findFirst({
    where: and(eq(doseLogs.userId, user.id), eq(doseLogs.day, today)),
  });
  if (todayLog) return;

  const list = await db.query.reminders.findMany({
    where: and(eq(reminders.userId, user.id), eq(reminders.enabled, true)),
  });

  for (const r of list) {
    if (r.time > hhmm) continue; // reminder time not reached yet (user-local app clock)
    if (!(await once(`dose:${user.id}:${r.id}:${today}`, "dose_reminder"))) continue;

    const anchor = r.habitAnchor ? ` ${r.habitAnchor.charAt(0).toLowerCase()}${r.habitAnchor.slice(1)}` : "";
    await notifyUser(user.id, {
      title: "Time for your dose 💊",
      body: `Take it${anchor} and check it off — one tap.`,
      icon: "flame",
      url: "/",
    });
    actions.push(`dose_reminder:${user.id}@${r.time}`);
  }
}

async function churnDetection(user: User, actions: string[]) {
  const lastDay = await lastDoseDayOf(user.id);
  const gap = daysWithoutDose(lastDay, userToday(user));
  if (gap < 2 || !lastDay) return;

  if (!user.churnFlag) {
    await db.update(users).set({ churnFlag: true }).where(eq(users.id, user.id));
  }
  if (!(await once(`churn:${user.id}:${lastDay}`, "churn"))) return;

  const motivation = user.motivation ? ` You told us why you started: “${user.motivation}”.` : "";
  await notifyUser(user.id, {
    title: `We miss you, ${user.name} 💚`,
    body: `It's been ${gap} days.${motivation} Pick it back up today.`,
    icon: "flame",
    url: "/",
  });
  actions.push(`churn:${user.id}`);
}

async function refillNudge(user: User, actions: string[]) {
  const now = appNow(user);
  const bottleRows = await db.query.bottles.findMany({
    where: and(eq(bottles.userId, user.id), eq(bottles.active, true)),
  });

  for (const bottle of bottleRows) {
    const { daysLeft } = bottleForecast(bottle, now);
    const stage = daysLeft <= 2 ? "final" : daysLeft <= 7 ? "first" : null;
    if (!stage) continue;
    if (!(await once(`refill:${bottle.id}:${stage}`, "refill"))) continue;

    const product = productById(bottle.productId);
    await notifyUser(user.id, {
      title: stage === "final" ? "Last chance — bottle almost empty ⏳" : "Your bottle is running low",
      body:
        stage === "final"
          ? `About ${daysLeft} day${daysLeft === 1 ? "" : "s"} of ${product?.name ?? "doses"} left. Reorder now.`
          : `About ${daysLeft} days of ${product?.name ?? "doses"} left — reorder in one tap.`,
      icon: "package",
      url: "/shop",
    });
    actions.push(`refill:${bottle.id}:${stage}`);
  }
}
