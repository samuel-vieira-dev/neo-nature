"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { seedNotifications, seedTickets, type AppNotification, type Ticket } from "./data";

// ---------------------------------------------------------------------------
// Global prototype state: streak, points, notifications, tickets, toasts.
// Persisted to localStorage so the demo survives refreshes.
// ---------------------------------------------------------------------------

const DAY = 86400000;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** last `n` days BEFORE today, as ISO dates — seeds an 11-day running streak */
const seedHistory = (n: number) => {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) out.push(isoDay(new Date(Date.now() - i * DAY)));
  return out;
};

export type Prefs = {
  doseReminder: boolean;
  orderUpdates: boolean;
  newContent: boolean;
  offers: boolean;
};

type AppState = {
  hydrated: boolean;
  name: string;
  checkinDays: string[];
  checkedInToday: boolean;
  streak: number;
  bestStreak: number;
  totalDays: number;
  freezes: number;
  points: number;
  checkIn: () => void;
  completedContent: string[];
  completeContent: (slug: string) => void;
  notifications: AppNotification[];
  unread: number;
  markAllRead: () => void;
  pushNotification: (n: Omit<AppNotification, "id" | "group" | "time">) => void;
  tickets: Ticket[];
  addTicket: (t: Omit<Ticket, "id" | "date" | "status" | "lastMessage">) => string;
  prefs: Prefs;
  setPref: (k: keyof Prefs, v: boolean) => void;
  reminderTime: string;
  setReminderTime: (t: string) => void;
  toast: (msg: string) => void;
};

const Ctx = createContext<AppState | null>(null);

export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
};

/** current streak length given a set of ISO check-in days */
function computeStreak(days: string[]): number {
  const set = new Set(days);
  let streak = 0;
  // streak counts backwards from today (or yesterday, if today isn't logged yet)
  let cursor = set.has(isoDay(new Date())) ? Date.now() : Date.now() - DAY;
  while (set.has(isoDay(new Date(cursor)))) {
    streak++;
    cursor -= DAY;
  }
  return streak;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [checkinDays, setCheckinDays] = useState<string[]>([]);
  const [bestStreak, setBestStreak] = useState(21);
  const [freezes, setFreezes] = useState(2);
  const [points, setPoints] = useState(480);
  const [completedContent, setCompletedContent] = useState<string[]>(["week-1-what-to-expect", "timing-your-dose"]);
  const [notifications, setNotifications] = useState<AppNotification[]>(seedNotifications);
  const [readAt, setReadAt] = useState(0);
  const [tickets, setTickets] = useState<Ticket[]>(seedTickets);
  const [prefs, setPrefs] = useState<Prefs>({ doseReminder: true, orderUpdates: true, newContent: true, offers: false });
  const [reminderTime, setReminderTimeState] = useState("08:00");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // hydrate from localStorage (or seed the demo)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("nn-demo-v1");
      if (raw) {
        const s = JSON.parse(raw);
        setCheckinDays(s.checkinDays ?? seedHistory(11));
        setBestStreak(s.bestStreak ?? 21);
        setFreezes(s.freezes ?? 2);
        setPoints(s.points ?? 480);
        setCompletedContent(s.completedContent ?? []);
        setPrefs(s.prefs ?? { doseReminder: true, orderUpdates: true, newContent: true, offers: false });
        setReminderTimeState(s.reminderTime ?? "08:00");
        setReadAt(s.readAt ?? 0);
        if (s.tickets) setTickets(s.tickets);
      } else {
        setCheckinDays(seedHistory(11));
      }
    } catch {
      setCheckinDays(seedHistory(11));
    }
    setHydrated(true);
  }, []);

  // persist
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      "nn-demo-v1",
      JSON.stringify({ checkinDays, bestStreak, freezes, points, completedContent, prefs, reminderTime, readAt, tickets })
    );
  }, [hydrated, checkinDays, bestStreak, freezes, points, completedContent, prefs, reminderTime, readAt, tickets]);

  const streak = useMemo(() => computeStreak(checkinDays), [checkinDays]);
  const checkedInToday = useMemo(() => checkinDays.includes(isoDay(new Date())), [checkinDays]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout((toast as unknown as { t?: number }).t);
    (toast as unknown as { t?: number }).t = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const checkIn = useCallback(() => {
    const today = isoDay(new Date());
    setCheckinDays((d) => (d.includes(today) ? d : [...d, today]));
    setPoints((p) => p + 10);
    setBestStreak((b) => Math.max(b, streak + 1));
  }, [streak]);

  const completeContent = useCallback((slug: string) => {
    setCompletedContent((c) => (c.includes(slug) ? c : [...c, slug]));
    setPoints((p) => p + 5);
  }, []);

  const unread = readAt > 0 ? 0 : notifications.filter((n) => n.group === "today").length;
  const markAllRead = useCallback(() => setReadAt(Date.now()), []);

  const pushNotification = useCallback((n: Omit<AppNotification, "id" | "group" | "time">) => {
    setNotifications((list) => [
      { ...n, id: `n-${Date.now()}`, group: "today" as const, time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) },
      ...list,
    ]);
    setReadAt(0);
  }, []);

  const addTicket = useCallback((t: Omit<Ticket, "id" | "date" | "status" | "lastMessage">) => {
    const id = `T-${Math.floor(2200 + Math.random() * 700)}`;
    setTickets((list) => [
      {
        ...t,
        id,
        status: "open" as const,
        date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        lastMessage: "Our team will get back to you within 24 hours.",
      },
      ...list,
    ]);
    return id;
  }, []);

  const setPref = useCallback((k: keyof Prefs, v: boolean) => setPrefs((p) => ({ ...p, [k]: v })), []);
  const setReminderTime = useCallback((t: string) => setReminderTimeState(t), []);

  const value: AppState = {
    hydrated,
    name: "Michael",
    checkinDays,
    checkedInToday,
    streak,
    bestStreak,
    totalDays: checkinDays.length,
    freezes,
    points,
    checkIn,
    completedContent,
    completeContent,
    notifications,
    unread,
    markAllRead,
    pushNotification,
    tickets,
    addTicket,
    prefs,
    setPref,
    reminderTime,
    setReminderTime,
    toast,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed left-1/2 top-4 z-[100] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2"
          >
            <div className="glass-strong rounded-2xl px-4 py-3 text-sm font-medium shadow-2xl">{toastMsg}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
