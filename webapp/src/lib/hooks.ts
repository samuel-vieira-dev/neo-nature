"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Server-state hooks (React Query). All data lives in Postgres now — these are
// the only way pages read/write it.
// ---------------------------------------------------------------------------

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
  return res.json();
}

export type Me = {
  user: {
    id: string;
    name: string;
    fullName: string;
    email: string;
    niche: string | null;
    motivation: string | null;
    address: string;
    memberSince: string;
    prefs: { doseReminder: boolean; orderUpdates: boolean; newContent: boolean; offers: boolean };
    freezes: number;
    onboarded: boolean;
    churnFlag: boolean;
  };
  today: string;
  now: string;
  streak: number;
  bestStreak: number;
  totalDays: number;
  checkedInToday: boolean;
  checkinDays: string[];
  lastDoseDay: string | null;
  points: number;
  pointsExpiringSoon: number;
  pointsNextExpiryAt: string | null;
  unread: number;
  tier: { tier: "Bronze" | "Silver" | "Gold"; nextTier: string | null; monthsToNext: number };
  subscription: {
    id: number;
    refId: string;
    status: string;
    priceMonthly: string;
    discountPct: number;
    nextBillingAt: string | null;
    monthsActive: number;
    skipsUsed: number;
  } | null;
  bottle: { productId: string; dosesTaken: number; dosesLeft: number; daysLeft: number; runsOutAt: string } | null;
  protocol: { day: number; phase: { n: number; name: string; focus: string }; message: string } | null;
  demo: { mode: boolean; dayOffset: number };
};

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/me") });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { recover?: boolean }) =>
      api<{ ok: true; streak: number; logged: boolean }>("/api/doses", {
        method: "POST",
        body: JSON.stringify(opts ?? {}),
      }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

// -------- notifications --------

export type NotificationItem = {
  id: number;
  title: string;
  body: string;
  icon: "flame" | "package" | "book" | "tag";
  read: boolean;
  group: "today" | "earlier";
  time: string;
};

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: NotificationItem[] }>("/api/notifications"),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/api/notifications/read", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useTestNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true; title: string; body: string }>("/api/notifications/test", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

// -------- orders --------

export type OrderDto = {
  id: string;
  number: string;
  date: string;
  status: "processing" | "in_transit" | "delivered";
  total: number;
  eta: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  address: string;
  tracking: { label: string; detail: string; date: string; done: boolean; current?: boolean }[];
  items: { productId: string; qty: number; price: number }[];
};

export function useOrders() {
  return useQuery({ queryKey: ["orders"], queryFn: () => api<{ orders: OrderDto[] }>("/api/orders") });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ["orders", id],
    queryFn: () => api<{ order: OrderDto }>(`/api/orders/${id}`),
    enabled: !!id,
  });
}

// -------- tickets --------

export type TicketDto = {
  id: string;
  subject: string;
  orderNumber: string;
  kind: "support" | "refund" | "billing";
  status: "open" | "in_review" | "resolved";
  lastMessage: string;
  date: string;
};

export function useTickets() {
  return useQuery({ queryKey: ["tickets"], queryFn: () => api<{ tickets: TicketDto[] }>("/api/tickets") });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { subject: string; orderNumber?: string; kind?: string; description?: string }) =>
      api<{ ok: true; ticket: TicketDto }>("/api/tickets", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickets"] }),
  });
}

// -------- reminders --------

export type ReminderDto = { id: number; time: string; habitAnchor: string | null; enabled: boolean };

export function useReminders() {
  return useQuery({ queryKey: ["reminders"], queryFn: () => api<{ reminders: ReminderDto[] }>("/api/reminders") });
}

export function useReminderMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["reminders"] });
  return {
    create: useMutation({
      mutationFn: (body: { time: string; habitAnchor?: string | null }) =>
        api("/api/reminders", { method: "POST", body: JSON.stringify(body) }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (body: { id: number; time?: string; habitAnchor?: string | null; enabled?: boolean }) =>
        api("/api/reminders", { method: "PATCH", body: JSON.stringify(body) }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api("/api/reminders", { method: "DELETE", body: JSON.stringify({ id }) }),
      onSuccess: invalidate,
    }),
  };
}

// -------- content --------

export function useContentProgress() {
  return useQuery({ queryKey: ["content"], queryFn: () => api<{ completed: string[] }>("/api/content") });
}

export function useCompleteContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => api("/api/content", { method: "POST", body: JSON.stringify({ slug }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

// -------- results --------

export type ResultEntry = {
  id: number;
  type: "weight" | "waist" | "ed_score" | "glucose_am" | "glucose_pm" | "victory";
  valueNum: number | null;
  valueText: string | null;
  photoId: number | null;
  day: string;
};

export function useResults() {
  return useQuery({ queryKey: ["results"], queryFn: () => api<{ entries: ResultEntry[] }>("/api/results") });
}

export function useLogResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: ResultEntry["type"]; valueNum?: number; valueText?: string; photoId?: number }) =>
      api<{ ok: true; updated: boolean }>("/api/results", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["results"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useSubmitTestimonial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { text: string; consent: boolean; photoId?: number }) =>
      api("/api/testimonials", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

// -------- prefs --------

export function useUpdatePrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Partial<Me["user"]["prefs"]>) =>
      api("/api/prefs", { method: "PATCH", body: JSON.stringify(prefs) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

// -------- subscription & refill --------

export type SubscriptionDto = {
  id: number;
  refId: string;
  status: "active" | "paused" | "canceled";
  priceMonthly: number;
  discountPct: number;
  nextBillingAt: string | null;
  monthsActive: number;
  skipsUsed: number;
  pausedUntil: string | null;
  startedAt: string;
  journey: { ordersToward: number; target: number; completed: boolean };
};

export function useSubscription() {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: () => api<{ subscription: SubscriptionDto | null }>("/api/subscription"),
  });
}

export function useSubscriptionAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: "pause" | "resume" | "skip" | "swap" | "cancel" | "reactivate"; productId?: string }) =>
      api("/api/subscription", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRefill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { productId: string; upsellProductIds?: string[] }) =>
      api<{ ok: true; orderId: string; number: string; total: number }>("/api/refill", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

// -------- rewards & referral --------

export function useRewards() {
  return useQuery({
    queryKey: ["rewards"],
    queryFn: () =>
      api<{
        balance: { total: number; expiringSoon: number; nextExpiryAt: string | null };
        ledger: { id: number; delta: number; reason: string; expiresAt: string | null; createdAt: string }[];
      }>("/api/rewards"),
  });
}

export function useRedeemReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rewardId: string) => api("/api/rewards", { method: "POST", body: JSON.stringify({ rewardId }) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useReferral() {
  return useQuery({
    queryKey: ["referral"],
    queryFn: () =>
      api<{
        code: string;
        invitedCount: number;
        convertedCount: number;
        pointsPerConversion: number;
        leaderboard: { rank: number; name: string; converted: number; you: boolean }[];
      }>("/api/referral"),
  });
}

// -------- demo controls --------

export function useDemoTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { delta?: number; reset?: boolean }) =>
      api<{ ok: true; dayOffset: number }>("/api/demo/time", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDemoReset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/api/demo/reset", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

// -------- auth --------

export function useLogout() {
  const router = useRouter();
  return useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      router.push("/login");
      router.refresh();
    },
  });
}
