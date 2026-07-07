"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Bell, BellRing, Flame, Package, BookOpen, Tag, FlaskConical } from "lucide-react";
import { useApp } from "@/lib/store";
import { useMe, useNotifications, useMarkAllRead, useTestNotification, useUpdatePrefs } from "@/lib/hooks";
import { FadeUp, PageHeader, Toggle } from "@/components/ui";

const icons = { flame: Flame, package: Package, book: BookOpen, tag: Tag };
const iconTones = {
  flame: "bg-orange-400/15 text-orange-300",
  package: "bg-sky-400/15 text-sky-300",
  book: "bg-emerald-400/15 text-emerald-300",
  tag: "bg-violet-400/15 text-violet-300",
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

  const testPush = () => {
    testNotification.mutate(undefined, {
      onSuccess: async (payload) => {
        if (!("Notification" in window)) {
          toast("This browser doesn't support push — added to the list below instead.");
          return;
        }
        let perm = Notification.permission;
        if (perm === "default") perm = await Notification.requestPermission();
        if (perm === "granted") {
          new Notification(payload.title, { body: payload.body, icon: "/icon.svg" });
          toast("Push sent! Check your system notifications.");
        } else {
          toast("Push permission denied — showing in-app instead.");
        }
      },
    });
  };

  const notifications = data?.notifications ?? [];
  const today = notifications.filter((n) => n.group === "today");
  const earlier = notifications.filter((n) => n.group === "earlier");
  const prefs = me?.user.prefs;

  return (
    <div>
      <PageHeader title="Notifications" subtitle="Stay on top of your routine" backHref="/" />

      {/* DEMO test button */}
      <FadeUp className="px-5">
        <div className="relative overflow-hidden rounded-3xl border border-amber-400/25 bg-amber-400/8 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15">
              <FlaskConical className="h-5 w-5 text-amber-300" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-200">Demo mode</p>
              <p className="text-[11px] leading-snug text-amber-200/60">
                Temporary button to preview how push notifications will feel.
              </p>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={testPush}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3 font-display text-sm font-bold text-amber-950"
          >
            <BellRing className="h-4 w-4" />
            {testNotification.isPending ? "Sending…" : "Send test notification"}
          </motion.button>
        </div>
      </FadeUp>

      {/* preferences */}
      <FadeUp delay={0.08} className="mt-5 px-5">
        <h3 className="mb-3 font-display text-lg font-bold">Preferences</h3>
        <div className="glass divide-y divide-white/6 rounded-3xl px-5">
          {(
            [
              { key: "doseReminder", label: "Daily dose reminder", sub: "Your streak's best friend" },
              { key: "orderUpdates", label: "Order & delivery updates", sub: "Every step of the way" },
              { key: "newContent", label: "New content", sub: "Articles, videos & audio" },
              { key: "offers", label: "Offers & early access", sub: "Member-only deals" },
            ] as const
          ).map((row) => (
            <div key={row.key} className="flex items-center justify-between py-4">
              <div>
                <p className="text-sm font-semibold">{row.label}</p>
                <p className="text-[11px] text-muted">{row.sub}</p>
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
        (group, gi) =>
          group.list.length > 0 && (
            <FadeUp key={group.title} delay={0.14 + gi * 0.06} className="mt-5 px-5">
              <h3 className="mb-3 font-display text-lg font-bold">{group.title}</h3>
              <div className="space-y-2.5">
                {group.list.map((n, i) => {
                  const Icon = icons[n.icon] ?? Bell;
                  return (
                    <motion.div
                      key={n.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.16 + i * 0.05 }}
                      className="glass flex gap-3 rounded-2xl p-4"
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${iconTones[n.icon] ?? iconTones.flame}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{n.title}</p>
                          <span className="shrink-0 text-[10px] text-white/30">{n.time}</span>
                        </div>
                        <p className="mt-0.5 text-xs leading-snug text-muted">{n.body}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </FadeUp>
          )
      )}
    </div>
  );
}
