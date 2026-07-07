"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { ArrowRight, Camera, CheckCircle2, PartyPopper } from "lucide-react";
import { useApp } from "@/lib/store";
import { useOrders, useCreateTicket } from "@/lib/hooks";
import { PageHeader, CTA } from "@/components/ui";
import Bottle from "@/components/Bottle";
import { productById, issueTypes } from "@/lib/data";

const stepVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

export default function NewTicketPage() {
  const { toast } = useApp();
  const { data: ordersData } = useOrders();
  const createTicket = useCreateTicket();
  const orders = ordersData?.orders ?? [];

  const [step, setStep] = useState(0);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [ticketId, setTicketId] = useState<string | null>(null);

  const submit = () => {
    const issueLabel = issueTypes.find((i) => i.id === issue)?.label ?? "Support request";
    createTicket.mutate(
      {
        subject: issueLabel,
        orderNumber: orderNumber ?? "—",
        kind: issue === "refund" ? "refund" : "support",
        description,
      },
      {
        onSuccess: (res) => {
          setTicketId(res.ticket.id);
          setStep(3);
          confetti({ particleCount: 60, spread: 60, origin: { y: 0.4 }, colors: ["#10b981", "#a3e635"] });
        },
      }
    );
  };

  return (
    <div>
      <PageHeader title="Open a ticket" subtitle="Takes less than a minute" backHref="/support" />

      {/* progress dots */}
      {step < 3 && (
        <div className="mb-5 flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              animate={{ width: step === i ? 24 : 8, backgroundColor: step >= i ? "#10b981" : "rgba(255,255,255,0.12)" }}
              className="h-2 rounded-full"
            />
          ))}
        </div>
      )}

      <div className="px-5">
        <AnimatePresence mode="wait">
          {/* STEP 1 — which order */}
          {step === 0 && (
            <motion.div key="s0" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
              <h2 className="font-display text-lg font-bold">Which order is this about?</h2>
              <div className="mt-4 space-y-3">
                {orders.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setOrderNumber(o.number)}
                    className={`glass w-full rounded-2xl p-4 text-left transition-all ${
                      orderNumber === o.number ? "border-emerald-400/50 ring-1 ring-emerald-400/40" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        {o.items.slice(0, 2).map((it) => {
                          const p = productById(it.productId);
                          if (!p) return null;
                          return <Bottle key={it.productId} accent={p.accent} label={p.short} className="h-12" />;
                        })}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">Order {o.number}</p>
                        <p className="text-[11px] text-muted">
                          {o.date} · ${o.total}
                        </p>
                      </div>
                      {orderNumber === o.number && <CheckCircle2 className="h-5 w-5 text-emerald-300" />}
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => setOrderNumber("Not order-related")}
                  className={`glass w-full rounded-2xl p-4 text-left text-sm text-muted ${
                    orderNumber === "Not order-related" ? "border-emerald-400/50 ring-1 ring-emerald-400/40" : ""
                  }`}
                >
                  It&apos;s not about a specific order
                </button>
              </div>
              {orderNumber && (
                <div className="mt-5">
                  <CTA onClick={() => setStep(1)}>
                    Continue <ArrowRight className="h-4 w-4" />
                  </CTA>
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 2 — what happened */}
          {step === 1 && (
            <motion.div key="s1" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
              <h2 className="font-display text-lg font-bold">What happened?</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {issueTypes.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => setIssue(it.id)}
                    className={`glass rounded-2xl p-4 text-center transition-all ${
                      issue === it.id ? "border-emerald-400/50 ring-1 ring-emerald-400/40" : ""
                    }`}
                  >
                    <span className="text-2xl">{it.emoji}</span>
                    <p className="mt-2 text-xs font-semibold leading-snug">{it.label}</p>
                  </button>
                ))}
              </div>
              {issue === "refund" && (
                <p className="mt-4 rounded-2xl bg-emerald-400/10 p-3 text-center text-xs text-emerald-300">
                  Covered by our 60-day guarantee — refunds are processed within 48h, no questions asked. 💚
                </p>
              )}
              {issue && (
                <div className="mt-5">
                  <CTA onClick={() => setStep(2)}>
                    Continue <ArrowRight className="h-4 w-4" />
                  </CTA>
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 3 — details */}
          {step === 2 && (
            <motion.div key="s2" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
              <h2 className="font-display text-lg font-bold">Tell us a bit more</h2>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Describe what happened — the more detail, the faster we can fix it."
                className="glass mt-4 w-full resize-none rounded-2xl p-4 text-sm placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
              />
              <button
                onClick={() => toast("Demo: photo upload will be enabled in Phase 2 📷")}
                className="glass mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-dashed py-4 text-sm text-muted"
              >
                <Camera className="h-4 w-4" /> Add a photo (optional)
              </button>
              <div className="mt-5">
                <CTA onClick={submit}>{createTicket.isPending ? "Submitting…" : "Submit ticket"}</CTA>
              </div>
            </motion.div>
          )}

          {/* SUCCESS */}
          {step === 3 && (
            <motion.div
              key="s3"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 18 }}
              className="pt-6 text-center"
            >
              <div className="grad glow mx-auto flex h-20 w-20 items-center justify-center rounded-full">
                <PartyPopper className="h-9 w-9 text-emerald-950" />
              </div>
              <h2 className="mt-5 font-display text-2xl font-bold">Ticket {ticketId} created!</h2>
              <p className="mx-auto mt-2 max-w-64 text-sm text-muted">
                Our team will reply within 24 hours. You&apos;ll get a push notification the moment we answer.
              </p>
              <div className="mt-6 space-y-3">
                <CTA href="/support">View my tickets</CTA>
                <Link href="/" className="block text-sm font-semibold text-muted">
                  Back to home
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
