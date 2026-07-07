"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarClock, CreditCard, HelpCircle, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/lib/store";
import { useCreateTicket } from "@/lib/hooks";
import { FadeUp, PageHeader, Chip } from "@/components/ui";

type BillingDto = {
  upcoming: { id: number; amount: number; cardDescriptor: string; chargedAt: string; daysUntil: number } | null;
  invoices: { id: number; amount: number; cardDescriptor: string; status: "paid" | "upcoming" | "refunded"; orderNumber: string | null; date: string }[];
};

const statusChip = {
  paid: { tone: "green" as const, label: "Paid" },
  upcoming: { tone: "amber" as const, label: "Upcoming" },
  refunded: { tone: "gray" as const, label: "Refunded" },
};

export default function BillingPage() {
  const { toast } = useApp();
  const router = useRouter();
  const createTicket = useCreateTicket();
  const { data } = useQuery({
    queryKey: ["billing"],
    queryFn: async () => {
      const res = await fetch("/api/billing");
      if (!res.ok) throw new Error("billing");
      return (await res.json()) as BillingDto;
    },
  });

  // chargeback deflection: in-app help is easier than calling the card issuer
  const helpWithCharge = (descriptor: string, amount: number, date: string) => {
    createTicket.mutate(
      {
        subject: `Question about charge ${descriptor} — $${amount} on ${date}`,
        kind: "billing",
      },
      {
        onSuccess: () => {
          toast("Ticket created — we'll clarify this charge within 24h 💚");
          router.push("/support");
        },
      }
    );
  };

  return (
    <div>
      <PageHeader title="Billing" subtitle="Every charge, exactly as it appears on your card" backHref="/profile" />

      {/* upcoming charge — the anti-surprise banner */}
      {data?.upcoming && (
        <FadeUp className="px-5">
          <div className="glass-strong relative overflow-hidden rounded-3xl border-amber-400/20 p-5">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-400/15 blur-3xl" />
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15">
                <CalendarClock className="h-5 w-5 text-amber-300" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">
                  Next charge{" "}
                  {data.upcoming.daysUntil === 0
                    ? "today"
                    : `in ${data.upcoming.daysUntil} day${data.upcoming.daysUntil > 1 ? "s" : ""}`}
                </p>
                <p className="text-xs text-muted">
                  ${data.upcoming.amount} · shows as{" "}
                  <span className="font-mono text-[10px] text-white/70">{data.upcoming.cardDescriptor}</span>
                </p>
              </div>
              <span className="font-display text-xl font-bold">${data.upcoming.amount}</span>
            </div>
            <Link
              href="/subscription"
              className="mt-3 block w-full rounded-xl border border-amber-400/25 bg-amber-400/10 py-2.5 text-center text-xs font-bold text-amber-300"
            >
              Need to pause or skip? Manage subscription →
            </Link>
          </div>
        </FadeUp>
      )}

      {/* descriptor explainer — kills "unknown charge" chargebacks */}
      <FadeUp delay={0.06} className="mt-4 px-5">
        <div className="glass flex items-start gap-3 rounded-2xl p-4">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <p className="text-xs leading-relaxed text-muted">
            Charges from us always appear as{" "}
            <span className="font-mono text-[10px] font-bold text-white/80">NEONATURE*</span> on your statement.
            Don&apos;t recognize something? Tap it below — it&apos;s faster than calling your bank.
          </p>
        </div>
      </FadeUp>

      {/* invoices */}
      <FadeUp delay={0.1} className="mt-5 px-5">
        <h3 className="mb-3 font-display text-lg font-bold">Charge history</h3>
        <div className="space-y-3">
          {(data?.invoices ?? []).map((inv, i) => {
            const chip = statusChip[inv.status];
            return (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="glass rounded-2xl p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[11px] font-bold text-white/85">{inv.cardDescriptor}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {inv.date}
                      {inv.orderNumber && ` · Order ${inv.orderNumber}`}
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 flex-col items-end gap-1.5">
                    <span className="font-display text-base font-bold">${inv.amount}</span>
                    <Chip tone={chip.tone}>{chip.label}</Chip>
                  </div>
                </div>
                {inv.status !== "upcoming" && (
                  <button
                    onClick={() => helpWithCharge(inv.cardDescriptor, inv.amount, inv.date)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/4 py-2 text-[11px] font-semibold text-muted active:bg-white/8"
                  >
                    <HelpCircle className="h-3.5 w-3.5" /> Get help with this charge
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      </FadeUp>

      <FadeUp delay={0.16} className="mt-5 px-5">
        <div className="glass flex items-start gap-3 rounded-2xl p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <p className="text-xs leading-relaxed text-muted">
            60-day money-back guarantee on everything. Refunds processed within 48h through the app — no phone calls,
            no return shipping.
          </p>
        </div>
      </FadeUp>
    </div>
  );
}
