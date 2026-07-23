"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { ArrowRight, Camera, CheckCircle2, PartyPopper, Package, HeartHandshake } from "lucide-react";
import { useApp } from "@/lib/store";
import { useOrders, useCreateTicket } from "@/lib/hooks";
import { PageHeader, CTA } from "@/components/ui";
import { issueTypes } from "@/lib/data";

const stepVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
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
          confetti({ particleCount: 40, spread: 55, origin: { y: 0.4 }, colors: ["#047857", "#34d399"] });
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
            <span
              key={i}
              className="h-2 rounded-full transition-all duration-200"
              style={{ width: step === i ? 24 : 8, backgroundColor: step >= i ? "var(--accent)" : "var(--border)" }}
            />
          ))}
        </div>
      )}

      <div className="px-5">
        <AnimatePresence mode="wait">
          {/* STEP 1 — which order */}
          {step === 0 && (
            <motion.div key="s0" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
              <h2 className="font-display text-lg font-bold text-[var(--text)]">Which order is this about?</h2>
              <div className="mt-4 space-y-3">
                {orders.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setOrderNumber(o.number)}
                    className={`card w-full rounded-2xl p-4 text-left transition-all ${
                      orderNumber === o.number ? "ring-2 ring-[var(--accent)]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)]">
                        <Package className="h-5 w-5 text-muted" />
                      </div>
                      <div className="flex-1">
                        <p className="text-base font-semibold text-[var(--text)]">Order {o.number}</p>
                        <p className="text-sm text-muted">
                          {o.date} · ${o.total}
                        </p>
                      </div>
                      {orderNumber === o.number && <CheckCircle2 className="h-5 w-5 text-[var(--accent)]" />}
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => setOrderNumber("Not order-related")}
                  className={`card w-full rounded-2xl p-4 text-left text-base text-muted ${
                    orderNumber === "Not order-related" ? "ring-2 ring-[var(--accent)]" : ""
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
            <motion.div key="s1" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
              <h2 className="font-display text-lg font-bold text-[var(--text)]">What happened?</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {issueTypes.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => setIssue(it.id)}
                    className={`card rounded-2xl p-4 text-center transition-all ${
                      issue === it.id ? "ring-2 ring-[var(--accent)]" : ""
                    }`}
                  >
                    <span className="text-2xl">{it.emoji}</span>
                    <p className="mt-2 text-sm font-semibold leading-snug text-[var(--text)]">{it.label}</p>
                  </button>
                ))}
              </div>
              {issue === "refund" && (
                <p className="mt-4 rounded-2xl bg-[var(--accent-soft)] p-3 text-center text-sm text-[var(--accent-strong)]">
                  Covered by our 60-day guarantee — refunds are processed within 48h, no questions asked. 💚
                </p>
              )}
              {issue && (
                <div className="mt-5">
                  <CTA onClick={() => setStep(issue === "refund" ? 5 : 2)}>
                    Continue <ArrowRight className="h-4 w-4" />
                  </CTA>
                </div>
              )}
            </motion.div>
          )}

          {/* REFUND SAVE-OFFER — simplified rescue moment (no subscription pause anymore) */}
          {step === 5 && (
            <motion.div key="s5" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
              <h2 className="font-display text-lg font-bold text-[var(--text)]">Before we process it —</h2>
              <p className="mt-1 text-base text-muted">
                Totally your call. But if one of these solves it, it&apos;s yours in one tap:
              </p>
              <div className="mt-4 space-y-3">
                <button
                  onClick={() =>
                    createTicket.mutate(
                      { subject: "Free replacement bottle requested", orderNumber: orderNumber ?? "—", kind: "support" },
                      {
                        onSuccess: (res) => {
                          setTicketId(res.ticket.id);
                          setStep(3);
                          toast("Replacement on the way — no charge 📦");
                        },
                      }
                    )
                  }
                  className="card flex w-full items-center gap-3 rounded-2xl p-4 text-left"
                >
                  <Package className="h-5 w-5 shrink-0 text-sky-700" />
                  <span className="flex-1">
                    <span className="block text-base font-bold text-[var(--text)]">Free replacement bottle</span>
                    <span className="block text-sm text-muted">Damaged or unsatisfying? We&apos;ll reship free</span>
                  </span>
                </button>
                <button
                  onClick={() =>
                    createTicket.mutate(
                      { subject: "Specialist consultation requested", orderNumber: orderNumber ?? "—", kind: "support" },
                      {
                        onSuccess: (res) => {
                          setTicketId(res.ticket.id);
                          setStep(3);
                          toast("A specialist will reach out within 24h 💚");
                        },
                      }
                    )
                  }
                  className="card flex w-full items-center gap-3 rounded-2xl p-4 text-left"
                >
                  <HeartHandshake className="h-5 w-5 shrink-0 text-[var(--accent)]" />
                  <span className="flex-1">
                    <span className="block text-base font-bold text-[var(--text)]">Talk to a specialist</span>
                    <span className="block text-sm text-muted">Dosage, timing, expectations — often it&apos;s fixable</span>
                  </span>
                </button>
              </div>
              <button onClick={() => setStep(2)} className="mt-4 w-full text-center text-base font-semibold text-rose-700">
                No thanks — continue with my refund
              </button>
            </motion.div>
          )}

          {/* STEP 3 — details */}
          {step === 2 && (
            <motion.div key="s2" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
              <h2 className="font-display text-lg font-bold text-[var(--text)]">Tell us a bit more</h2>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Describe what happened — the more detail, the faster we can fix it."
                className="card mt-4 w-full resize-none rounded-2xl p-4 text-base placeholder:text-muted"
              />
              <button
                onClick={() => toast("Photo attachments are coming soon 📷")}
                className="card mt-3 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border-dashed py-4 text-base text-muted"
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="pt-6 text-center"
            >
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent)]">
                <PartyPopper className="h-9 w-9 text-white" />
              </div>
              <h2 className="mt-5 font-display text-2xl font-bold text-[var(--text)]">
                {ticketId ? `Ticket ${ticketId} created!` : "All set!"}
              </h2>
              <p className="mx-auto mt-2 max-w-64 text-base text-muted">
                {issue === "refund" && ticketId
                  ? "Refund confirmed — processed within 48 hours, and you can keep the bottle."
                  : ticketId
                  ? "Our team will reply within 24 hours. You'll get a push notification the moment we answer."
                  : "Done — no ticket needed. You'll see the change reflected right away."}
              </p>
              <div className="mt-6 space-y-3">
                <CTA href="/support">View my tickets</CTA>
                <Link href="/" className="block text-base font-semibold text-muted">
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
