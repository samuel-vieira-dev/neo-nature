"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Server-state hooks (React Query). All data lives in Postgres now — these are
// the only way pages read/write it.
// ---------------------------------------------------------------------------

/**
 * Pages where a missing customer session is NOT an error, so a 401 must never
 * bounce the browser to /login. The admin area runs on its own session
 * (nn_admin) — redirecting from there would kick the admin out of /admin-login.
 */
function isCustomerAuthPage(pathname: string): boolean {
  return pathname.startsWith("/login") || pathname.startsWith("/admin");
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    if (!isCustomerAuthPage(window.location.pathname)) window.location.href = "/login";
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
    email: string | null;
    phone: string | null;
    niche: string | null;
    motivation: string | null;
    address: string;
    memberSince: string;
    prefs: { doseReminder: boolean; orderUpdates: boolean; newContent: boolean; offers: boolean };
    onboarded: boolean;
    // First-time customer whose package hadn't arrived: did the lightweight
    // install+notifications setup instead of the full onboarding (see
    // OnboardingGate). Home shows package tracking until they start the plan.
    awaitingDelivery: boolean;
    churnFlag: boolean;
  };
  // An order of theirs is still on its way (confirmed, or shipped and not yet
  // delivered) — drives the pre-arrival onboarding/home.
  pendingDelivery: boolean;
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
  impersonating: boolean;
};

export function useMe() {
  // Skip on the admin area: it has no customer session, so the request would
  // only ever 401 (and admins shouldn't pay for a pointless round-trip).
  const pathname = usePathname();
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/api/me"),
    enabled: !pathname.startsWith("/admin"),
  });
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

export type OrderItemDto = {
  productName: string;
  sku: string | null;
  thumbnailUrl: string | null;
  /** Single-bottle packshot from public/products (null when we have no mockup yet). */
  imageUrl: string | null;
  qty: number;
  price: number;
  /** Came from an upsell/downsell order folded into this purchase. */
  addOn: boolean;
  /** The BuyGoods id of the row this line came from (differs from the purchase's on add-ons). */
  orderNumber: string;
  /** Status of that row — an add-on can be refunded on its own. */
  status: "confirmed" | "shipped" | "canceled" | "refunded";
};

/** One purchase: the main order with its upsell/downsell orders folded in. */
export type OrderDto = {
  id: string;
  number: string;
  bundledNumbers: string[];
  memberIds: string[];
  date: string;
  placedAt: string;
  status: "confirmed" | "shipped" | "canceled" | "refunded";
  total: number;
  currency: string;
  shippingStatus: string | null;
  trackingId: string | null;
  trackingUrl: string | null;
  address: string;
  tracking: { label: string; detail: string; date: string; done: boolean; current?: boolean }[];
  delivered: boolean;
  awaitingArrival: boolean;
  items: OrderItemDto[];
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
    mutationFn: (body: {
      subject: string;
      orderNumber?: string;
      kind?: string;
      description?: string;
      clientRequestId?: string;
    }) => api<{ ok: true; ticket: TicketDto }>("/api/tickets", { method: "POST", body: JSON.stringify(body) }),
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
