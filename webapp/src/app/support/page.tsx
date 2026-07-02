"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, MessageCirclePlus, Clock, CheckCircle2, CircleDot } from "lucide-react";
import { useApp } from "@/lib/store";
import { FadeUp, PageHeader, Chip, CTA } from "@/components/ui";
import { faqs } from "@/lib/data";

const ticketStatus = {
  open: { tone: "amber" as const, label: "Open", icon: CircleDot },
  in_review: { tone: "blue" as const, label: "In review", icon: Clock },
  resolved: { tone: "green" as const, label: "Resolved", icon: CheckCircle2 },
};

export default function SupportPage() {
  const { tickets } = useApp();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div>
      <PageHeader title="Support" subtitle="We reply within 24 hours — usually much faster" backHref="/" />

      <FadeUp className="px-5">
        <CTA href="/support/new">
          <MessageCirclePlus className="h-5 w-5" /> Open a ticket
        </CTA>
        <p className="mt-2 text-center text-[11px] text-muted">
          Problems, refunds, wrong items — we make it right, no hoops.
        </p>
      </FadeUp>

      {/* tickets */}
      <FadeUp delay={0.08} className="mt-6 px-5">
        <h3 className="mb-3 font-display text-lg font-bold">Your tickets</h3>
        {tickets.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center text-sm text-muted">No tickets yet — all smooth 🙌</div>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => {
              const s = ticketStatus[t.status];
              return (
                <div key={t.id} className="glass rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold leading-snug">{t.subject}</p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {t.id} · Order {t.orderNumber} · {t.date}
                      </p>
                    </div>
                    <Chip tone={s.tone}>{s.label}</Chip>
                  </div>
                  <p className="mt-3 rounded-xl bg-white/4 p-3 text-xs leading-relaxed text-muted">
                    <span className="font-semibold text-emerald-300">Neo Nature team:</span> {t.lastMessage}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </FadeUp>

      {/* FAQ */}
      <FadeUp delay={0.14} className="mt-6 px-5">
        <h3 className="mb-3 font-display text-lg font-bold">Quick answers</h3>
        <div className="space-y-2.5">
          {faqs.map((f, i) => {
            const open = openFaq === i;
            return (
              <div key={i} className="glass overflow-hidden rounded-2xl">
                <button
                  onClick={() => setOpenFaq(open ? null : i)}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-semibold"
                >
                  {f.q}
                  <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
                    <ChevronDown className="h-4 w-4 text-muted" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.21, 0.65, 0.36, 1] }}
                    >
                      <p className="px-4 pb-4 text-xs leading-relaxed text-muted">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </FadeUp>

      <FadeUp delay={0.2} className="mt-6 px-5 text-center">
        <p className="text-[11px] text-muted">
          Prefer email? <Link href="/support/new" className="font-semibold text-emerald-300">support@neonature.com</Link>
        </p>
      </FadeUp>
    </div>
  );
}
