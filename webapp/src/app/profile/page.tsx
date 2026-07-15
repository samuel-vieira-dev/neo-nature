"use client";

import Link from "next/link";
import { Bell, ChevronRight, Clock, CreditCard, LifeBuoy, LogOut, MapPin, Package } from "lucide-react";
import { useApp } from "@/lib/store";
import { useMe, useUpdatePrefs, useReminders, useReminderMutations, useLogout } from "@/lib/hooks";
import { FadeUp, Toggle } from "@/components/ui";
import DemoControls from "@/components/DemoControls";

export default function ProfilePage() {
  const { toast } = useApp();
  const { data: me } = useMe();
  const updatePrefs = useUpdatePrefs();
  const { data: remindersData } = useReminders();
  const reminderMutations = useReminderMutations();
  const logout = useLogout();

  const firstReminder = remindersData?.reminders[0];
  const initials = me ? me.user.fullName.split(" ").map((s) => s[0]).join("").slice(0, 2) : "··";

  return (
    <div className="pt-8">
      {/* identity */}
      <FadeUp className="px-5 text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[var(--accent)] font-display text-3xl font-bold text-white">
          {initials}
        </div>
        <h1 className="mt-3 font-display text-2xl font-bold text-[var(--text)]">{me?.user.fullName ?? "…"}</h1>
        <p className="text-sm text-muted">
          {me?.user.email}
          {me && (
            <>
              {" "}
              · Member since {new Date(me.user.memberSince).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </>
          )}
        </p>
      </FadeUp>

      {/* daily reminder */}
      <FadeUp delay={0.06} className="mt-6 px-5">
        <div className="card rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-[var(--text)]">Daily dose reminder</p>
                <p className="text-sm text-muted">
                  {firstReminder?.habitAnchor ? `Anchored: ${firstReminder.habitAnchor}` : "We'll nudge you at this time"}
                </p>
              </div>
            </div>
            <Toggle
              on={me?.user.prefs.doseReminder ?? false}
              onChange={(v) => updatePrefs.mutate({ doseReminder: v })}
            />
          </div>
          {me?.user.prefs.doseReminder && firstReminder && (
            <div className="mt-4">
              <input
                type="time"
                value={firstReminder.time}
                onChange={(e) => {
                  reminderMutations.update.mutate({ id: firstReminder.id, time: e.target.value });
                  toast(`Reminder set for ${e.target.value}`);
                }}
                className="card w-full min-h-[56px] rounded-2xl px-4 text-center font-display text-2xl font-bold"
              />
              {(remindersData?.reminders.length ?? 0) > 1 && (
                <p className="mt-2 text-center text-sm text-muted">
                  +{remindersData!.reminders.length - 1} more reminder{remindersData!.reminders.length > 2 ? "s" : ""} configured
                </p>
              )}
            </div>
          )}
        </div>
      </FadeUp>

      {/* address */}
      <FadeUp delay={0.1} className="mt-4 px-5">
        <div className="card flex items-center gap-3 rounded-2xl p-4">
          <MapPin className="h-5 w-5 shrink-0 text-[var(--accent)]" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--text)]">Shipping address</p>
            <p className="text-sm text-muted">{me?.user.address}</p>
          </div>
          <button onClick={() => toast("Demo: address editing arrives with Phase 2 ✏️")} className="text-sm font-bold text-[var(--accent)]">
            Edit
          </button>
        </div>
      </FadeUp>

      {/* menu */}
      <FadeUp delay={0.14} className="mt-4 px-5">
        <div className="card divide-y divide-[var(--border)] rounded-3xl">
          {[
            { href: "/orders", icon: Package, label: "My orders" },
            { href: "/billing", icon: CreditCard, label: "Billing & charges" },
            { href: "/notifications", icon: Bell, label: "Notifications" },
            { href: "/support", icon: LifeBuoy, label: "Help & support" },
          ].map((row) => (
            <Link
              key={row.href}
              href={row.href}
              className="flex min-h-[56px] items-center gap-3 px-5 py-4 active:bg-[var(--surface)]"
            >
              <row.icon className="h-5 w-5 text-muted" />
              <span className="flex-1 text-base font-semibold text-[var(--text)]">{row.label}</span>
              <ChevronRight className="h-4 w-4 text-muted" />
            </Link>
          ))}
          <button
            onClick={() => logout.mutate()}
            className="flex min-h-[56px] w-full items-center gap-3 px-5 py-4 text-left active:bg-[var(--surface)]"
          >
            <LogOut className="h-5 w-5 text-rose-600" />
            <span className="flex-1 text-base font-semibold text-rose-600">Sign out</span>
          </button>
        </div>
      </FadeUp>

      {/* demo controls */}
      <FadeUp delay={0.18} className="mt-4 px-5">
        <DemoControls />
      </FadeUp>

      <FadeUp delay={0.22} className="mt-6 text-center">
        <p className="text-xs text-muted">Neo Nature · v0.3 demo build</p>
      </FadeUp>
    </div>
  );
}
