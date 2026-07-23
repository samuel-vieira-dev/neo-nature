"use client";

import { useEffect, useRef } from "react";
import { Bell, BellRing, Flame, Package, BookOpen, Tag } from "lucide-react";
import { useApp } from "@/lib/store";
import { ensurePushSubscription } from "@/lib/push";
import { useMe, useNotifications, useMarkAllRead, useTestNotification, useUpdatePrefs } from "@/lib/hooks";
import { FadeUp, PageHeader, Toggle } from "@/components/ui";

const icons = { flame: Flame, package: Package, book: BookOpen, tag: Tag };
const iconTones = {
  flame: "bg-amber-50 text-amber-700",
  package: "bg-sky-50 text-sky-700",
  book: "bg-[var(--accent-soft)] text-[var(--accent)]",
  tag: "bg-violet-50 text-violet-700",
};

export default function NotificationsPage() {
  const { toast } = useApp();
  const { data: me } = useMe();
  const { data } = useNotifications();
  const markAllRead = useMarkAllRead();
  const testNotification = useTestNotification();
  const updatePrefs = useUpdatePrefs();
  const marked = useRef(false);

  useEffect(() => {
    if (!marked.current && (me?.unread ?? 0) > 0) {
      marked.current = true;
      const t = setTimeout(() => markAllRead.mutate(), 800);
      return () => clearTimeout(t);
    }
  }, [me?.unread, markAllRead]);

  const enablePush = async () => {
    const status = await ensurePushSubscription().catch(() => "unsupported" as const);
    if (status === "denied") return toast("Notifications are blocked in your browser settings.");
    if (status === "unsupported") return toast("Push isn't supported on this device.");
    testNotification.mutate(undefined, {
      onSuccess: () => toast("Notifications enabled — you'll get dose reminders and order updates 🔔"),
    });
  };

  const notifications = data?.notifications ?? [];
  const today = notifications.filter((n) => n.group === "today");
  const earlier = notifications.filter((n) => n.group === "earlier");
  const prefs = me?.user.prefs;

  return (
    <div>
      <PageHeader title="Notifications" subtitle="Stay on top of your routine" backHref="/" />

      {/* enable push on this device */}
      <FadeUp className="px-5">
        <div className="card rounded-3xl p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
              <BellRing className="h-5 w-5 text-[var(--accent)]" />
            </div>
            <div className="flex-1">
              <p className="text-base font-bold text-[var(--text)]">Push notifications</p>
              <p className="text-sm leading-snug text-muted">Dose reminders and order updates, right on your phone.</p>
            </div>
          </div>
          <button
            onClick={enablePush}
            className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-3 font-display text-base font-bold text-white"
          >
            <Bell className="h-4 w-4" />
            {testNotification.isPending ? "Enabling…" : "Enable on this device"}
          </button>
        </div>
      </FadeUp>

      {/* preferences */}
      <FadeUp delay={0.06} className="mt-5 px-5">
        <h3 className="mb-3 font-display text-lg font-bold text-[var(--text)]">Preferences</h3>
        <div className="card divide-y divide-[var(--border)] rounded-3xl px-5">
          {(
            [
              { key: "doseReminder", label: "Daily dose reminder", sub: "Your streak's best friend" },
              { key: "orderUpdates", label: "Order & delivery updates", sub: "Every step of the way" },
              { key: "newContent", label: "New content", sub: "Tips, articles & updates" },
              { key: "offers", label: "Offers & early access", sub: "Member-only deals" },
            ] as const
          ).map((row) => (
            <div key={row.key} className="flex items-center justify-between py-4">
              <div>
                <p className="text-base font-semibold text-[var(--text)]">{row.label}</p>
                <p className="text-sm text-muted">{row.sub}</p>
              </div>
              <Toggle
                on={prefs?.[row.key] ?? false}
                onChange={(v) => updatePrefs.mutate({ [row.key]: v })}
              />
            </div>
          ))}
        </div>
      </FadeUp>

      {/* feed */}
      {[
        { title: "Today", list: today },
        { title: "Earlier", list: earlier },
      ].map(
        (group) =>
          group.list.length > 0 && (
            <FadeUp key={group.title} delay={0.1} className="mt-5 px-5">
              <h3 className="mb-3 font-display text-lg font-bold text-[var(--text)]">{group.title}</h3>
              <div className="space-y-2.5">
                {group.list.map((n) => {
                  const Icon = icons[n.icon] ?? Bell;
                  return (
                    <div key={n.id} className="card flex gap-3 rounded-2xl p-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${iconTones[n.icon] ?? iconTones.flame}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-base font-semibold text-[var(--text)]">{n.title}</p>
                          <span className="shrink-0 text-xs text-muted">{n.time}</span>
                        </div>
                        <p className="mt-0.5 text-sm leading-snug text-muted">{n.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </FadeUp>
          )
      )}
    </div>
  );
}
