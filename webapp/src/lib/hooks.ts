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
  unread: number;
  bottle: { productId: string; dosesTaken: number; dosesLeft: number; daysLeft: number; runsOutAt: string } | null;
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

// -------- banner --------

export type BannerDto = { id: number; title: string; body: string; ctaLabel: string | null; ctaUrl: string | null };

export function useBanner() {
  return useQuery({
    queryKey: ["banner"],
    queryFn: () => api<{ banner: BannerDto | null }>("/api/banner"),
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

// -------- prefs --------

export function useUpdatePrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Partial<Me["user"]["prefs"]>) =>
      api("/api/prefs", { method: "PATCH", body: JSON.stringify(prefs) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
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

export function useDemoNextBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true; banner: { id: number; title: string } }>("/api/demo/banner", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["banner"] }),
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
