"use client";

import { useRouter } from "next/navigation";
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
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100">
                <CalendarClock className="h-5 w-5 text-amber-700" />
              </div>
              <div className="flex-1">
                <p className="text-base font-bold text-[var(--text)]">
                  Next charge{" "}
                  {data.upcoming.daysUntil === 0
                    ? "today"
                    : `in ${data.upcoming.daysUntil} day${data.upcoming.daysUntil > 1 ? "s" : ""}`}
                </p>
                <p className="text-sm text-muted">
                  ${data.upcoming.amount} · shows as{" "}
                  <span className="font-mono text-xs text-[var(--text)]">{data.upcoming.cardDescriptor}</span>
                </p>
              </div>
              <span className="font-display text-xl font-bold text-[var(--text)]">${data.upcoming.amount}</span>
            </div>
          </div>
        </FadeUp>
      )}

      {/* descriptor explainer — kills "unknown charge" chargebacks */}
      <FadeUp delay={0.05} className="mt-4 px-5">
        <div className="card flex items-start gap-3 rounded-2xl p-4">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
          <p className="text-sm leading-relaxed text-muted">
            Charges from us always appear as{" "}
            <span className="font-mono text-xs font-bold text-[var(--text)]">NEONATURE*</span> on your statement.
            Don&apos;t recognize something? Tap it below — it&apos;s faster than calling your bank.
          </p>
        </div>
      </FadeUp>

      {/* invoices */}
      <FadeUp delay={0.08} className="mt-5 px-5">
        <h3 className="mb-3 font-display text-lg font-bold text-[var(--text)]">Charge history</h3>
        <div className="space-y-3">
          {(data?.invoices ?? []).map((inv) => {
            const chip = statusChip[inv.status];
            return (
              <div key={inv.id} className="card rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm font-bold text-[var(--text)]">{inv.cardDescriptor}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {inv.date}
                      {inv.orderNumber && ` · Order ${inv.orderNumber}`}
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 flex-col items-end gap-1.5">
                    <span className="font-display text-base font-bold text-[var(--text)]">${inv.amount}</span>
                    <Chip tone={chip.tone}>{chip.label}</Chip>
                  </div>
                </div>
                {inv.status !== "upcoming" && (
                  <button
                    onClick={() => helpWithCharge(inv.cardDescriptor, inv.amount, inv.date)}
                    className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--surface)] py-2 text-sm font-semibold text-muted active:bg-[var(--border)]"
                  >
                    <HelpCircle className="h-4 w-4" /> Get help with this charge
                  </button>
                )}
              </div>
            );
          })}
          {(data?.invoices ?? []).length === 0 && (
            <p className="py-6 text-center text-base text-muted">No charges yet.</p>
          )}
        </div>
      </FadeUp>

      <FadeUp delay={0.12} className="mt-5 px-5">
        <div className="card flex items-start gap-3 rounded-2xl p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
          <p className="text-sm leading-relaxed text-muted">
            60-day money-back guarantee on everything. Refunds processed within 48h through the app — no phone calls,
            no return shipping.
          </p>
        </div>
      </FadeUp>
    </div>
  );
}
