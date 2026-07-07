"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgePercent,
  Calendar,
  Check,
  ChevronRight,
  Crown,
  Gift,
  Lock,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Shield,
  SkipForward,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useMe, useSubscription, useSubscriptionAction } from "@/lib/hooks";
import { FadeUp, PageHeader, Chip, CTA } from "@/components/ui";
import Bottle from "@/components/Bottle";
import { products, productById } from "@/lib/data";

type Sheet = null | "swap" | "cancel";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "—";

export default function SubscriptionPage() {
  const { toast } = useApp();
  const { data: me } = useMe();
  const { data } = useSubscription();
  const act = useSubscriptionAction();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [cancelStep, setCancelStep] = useState(0);

  const sub = data?.subscription;
  const product = sub ? productById(sub.refId) : null;

  if (data && !sub) {
    return (
      <div>
        <PageHeader title="Subscription" backHref="/profile" />
        <div className="px-5">
          <div className="glass rounded-3xl p-6 text-center">
            <p className="text-sm text-muted">You don&apos;t have a subscription yet.</p>
            <div className="mt-4">
              <CTA href="/shop">Explore member pricing</CTA>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const run = (action: "pause" | "resume" | "skip" | "cancel" | "reactivate" | "swap", productId?: string, msg?: string) =>
    act.mutate(
      { action, productId },
      {
        onSuccess: () => {
          setSheet(null);
          setCancelStep(0);
          if (msg) toast(msg);
        },
      }
    );

  const benefits = [
    { icon: BadgePercent, text: `${sub?.discountPct ?? 15}% member pricing on everything` },
    { icon: Gift, text: "Early access to new formulas" },
    { icon: Shield, text: "1 extra streak freeze every month" },
    { icon: Sparkles, text: "Priority support — real humans, fast" },
  ];

  const monthBonuses = [
    { label: "Exclusive content pack", detail: "Advanced protocols & expert sessions" },
    { label: "Free surprise gift", detail: "Ships with your 3rd delivery" },
    { label: "Gold-tier fast track", detail: "Double tier progress from month 3" },
  ];

  return (
    <div>
      <PageHeader title="My subscription" subtitle="Your protocol, on autopilot" backHref="/profile" />

      {/* status card */}
      {sub && product && (
        <FadeUp className="px-5">
          <div className="glass-strong relative overflow-hidden rounded-3xl p-5">
            <div
              className="absolute inset-x-0 top-0 h-32 opacity-25"
              style={{ background: `radial-gradient(circle at 50% -30%, ${product.accent}, transparent 72%)` }}
            />
            <div className="flex items-center gap-4">
              <Bottle accent={product.accent} label={product.short} className="h-24 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-display text-lg font-bold">{product.name}</p>
                  <Chip tone={sub.status === "active" ? "green" : sub.status === "paused" ? "amber" : "gray"}>
                    {sub.status === "active" ? "Active" : sub.status === "paused" ? "Paused" : "Canceled"}
                  </Chip>
                </div>
                <p className="mt-0.5 text-sm">
                  <span className="font-display text-xl font-bold">${sub.priceMonthly}</span>
                  <span className="text-xs text-muted">/month</span>
                  <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    -{sub.discountPct}%
                  </span>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                  <Calendar className="h-3 w-3" />
                  {sub.status === "active"
                    ? `Renews ${fmtDate(sub.nextBillingAt)} — we'll remind you 3 days before`
                    : sub.status === "paused"
                    ? `Paused until ${fmtDate(sub.pausedUntil)}`
                    : "No further charges"}
                </p>
              </div>
            </div>
          </div>
        </FadeUp>
      )}

      {/* complete your protocol journey */}
      {sub && (
        <FadeUp delay={0.07} className="mt-4 px-5">
          <div className="glass rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Complete your protocol</h3>
              <span className="text-xs font-bold text-emerald-300">
                {sub.journey.ordersToward}/{sub.journey.target} bottles
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              90 days of consistency = the full result. Each delivery is one step.
            </p>

            <div className="mt-4 flex items-center gap-2">
              {[1, 2, 3].map((n) => {
                const done = sub.journey.ordersToward >= n;
                return (
                  <div key={n} className="flex flex-1 items-center gap-2">
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.15 + n * 0.1 }}
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                        done ? "grad glow" : "border-2 border-dashed border-white/15"
                      }`}
                    >
                      {done ? (
                        <Check className="h-5 w-5 text-emerald-950" strokeWidth={3} />
                      ) : (
                        <span className="font-display text-sm font-bold text-white/30">{n}</span>
                      )}
                    </motion.div>
                    {n < 3 && <div className={`h-1 flex-1 rounded-full ${sub.journey.ordersToward > n ? "grad" : "bg-white/10"}`} />}
                  </div>
                );
              })}
            </div>

            {/* month-3 bonuses */}
            <div className="mt-4 space-y-2">
              {monthBonuses.map((b) => (
                <div
                  key={b.label}
                  className={`flex items-center gap-3 rounded-xl p-3 ${
                    sub.journey.completed ? "bg-amber-400/10" : "bg-white/4"
                  }`}
                >
                  {sub.journey.completed ? (
                    <Gift className="h-4 w-4 shrink-0 text-amber-300" />
                  ) : (
                    <Lock className="h-4 w-4 shrink-0 text-white/25" />
                  )}
                  <div>
                    <p className={`text-xs font-bold ${sub.journey.completed ? "text-amber-200" : "text-white/50"}`}>
                      {b.label}
                      {sub.journey.completed && " — unlocked! 🎉"}
                    </p>
                    <p className="text-[10px] text-muted">{b.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </FadeUp>
      )}

      {/* club benefits */}
      <FadeUp delay={0.12} className="mt-4 px-5">
        <div className="glass rounded-3xl p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-bold">
            <Crown className="h-4 w-4 text-amber-300" /> Subscriber club
          </h3>
          <div className="mt-3 space-y-2.5">
            {benefits.map((b) => (
              <p key={b.text} className="flex items-center gap-3 text-xs text-muted">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-400/15">
                  <b.icon className="h-3.5 w-3.5 text-emerald-300" />
                </span>
                {b.text}
              </p>
            ))}
          </div>
        </div>
      </FadeUp>

      {/* manage */}
      {sub && (
        <FadeUp delay={0.16} className="mt-4 px-5">
          <h3 className="mb-3 font-display text-base font-bold">Manage</h3>
          <div className="glass divide-y divide-white/6 rounded-3xl">
            {sub.status === "active" && (
              <>
                <button
                  onClick={() => run("pause", undefined, "Paused for 30 days — everything else stays ⏸️")}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left active:bg-white/4"
                >
                  <PauseCircle className="h-5 w-5 text-amber-300" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">Pause for a month</span>
                    <span className="block text-[11px] text-muted">Running behind on doses? No charges while paused</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-white/25" />
                </button>
                <button
                  onClick={() => run("skip", undefined, "Next delivery skipped ⏭️")}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left active:bg-white/4"
                >
                  <SkipForward className="h-5 w-5 text-sky-300" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">Skip next delivery</span>
                    <span className="block text-[11px] text-muted">Push the next charge 30 days out</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-white/25" />
                </button>
                <button
                  onClick={() => setSheet("swap")}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left active:bg-white/4"
                >
                  <RefreshCw className="h-5 w-5 text-violet-300" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">Swap product</span>
                    <span className="block text-[11px] text-muted">Same discount, different formula</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-white/25" />
                </button>
                <button
                  onClick={() => { setSheet("cancel"); setCancelStep(0); }}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left active:bg-white/4"
                >
                  <XCircle className="h-5 w-5 text-rose-300" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-rose-300">Cancel subscription</span>
                    <span className="block text-[11px] text-muted">Two taps, no phone calls, no hoops</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-white/25" />
                </button>
              </>
            )}
            {sub.status === "paused" && (
              <button
                onClick={() => run("resume", undefined, "Subscription resumed 💚")}
                className="flex w-full items-center gap-3 px-5 py-4 text-left active:bg-white/4"
              >
                <PlayCircle className="h-5 w-5 text-emerald-300" />
                <span className="flex-1">
                  <span className="block text-sm font-semibold">Resume subscription</span>
                  <span className="block text-[11px] text-muted">Pick up right where you left off</span>
                </span>
                <ChevronRight className="h-4 w-4 text-white/25" />
              </button>
            )}
            {sub.status === "canceled" && (
              <button
                onClick={() => run("reactivate", undefined, "Welcome back! Subscription reactivated 💚")}
                className="flex w-full items-center gap-3 px-5 py-4 text-left active:bg-white/4"
              >
                <PlayCircle className="h-5 w-5 text-emerald-300" />
                <span className="flex-1">
                  <span className="block text-sm font-semibold">Reactivate</span>
                  <span className="block text-[11px] text-muted">Member pricing & perks, restored in one tap</span>
                </span>
                <ChevronRight className="h-4 w-4 text-white/25" />
              </button>
            )}
          </div>
        </FadeUp>
      )}

      {/* sheets */}
      <AnimatePresence>
        {sheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setSheet(null)}
          >
            <motion.div
              initial={{ y: 400 }}
              animate={{ y: 0 }}
              exit={{ y: 400 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0d1512] p-6 pb-10"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />

              {sheet === "swap" && (
                <>
                  <h2 className="font-display text-lg font-bold">Swap your product</h2>
                  <p className="mt-1 text-xs text-muted">Same {sub?.discountPct}% member discount applies.</p>
                  <div className="mt-4 space-y-2.5">
                    {products
                      .filter((p) => p.featured && p.id !== sub?.refId)
                      .map((p) => (
                        <button
                          key={p.id}
                          onClick={() =>
                            run("swap", p.id, `Swapped to ${p.name} 🔄`)
                          }
                          className="glass flex w-full items-center gap-3 rounded-2xl p-3 text-left"
                        >
                          <Bottle accent={p.accent} label={p.short} className="h-14 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold">{p.name}</span>
                            <span className="block truncate text-[11px] text-muted">{p.tagline}</span>
                          </span>
                          <span className="shrink-0 font-display text-sm font-bold text-emerald-300">
                            ${(p.price * (1 - (sub?.discountPct ?? 15) / 100)).toFixed(2)}/mo
                          </span>
                        </button>
                      ))}
                  </div>
                </>
              )}

              {sheet === "cancel" && cancelStep === 0 && (
                <>
                  <h2 className="font-display text-lg font-bold">Before you go —</h2>
                  <p className="mt-1 text-xs text-muted">
                    Most people cancel because of timing, not the product. These fix timing:
                  </p>
                  <div className="mt-4 space-y-2.5">
                    <button
                      onClick={() => run("pause", undefined, "Paused for 30 days instead — smart move ⏸️")}
                      className="glass flex w-full items-center gap-3 rounded-2xl p-4 text-left"
                    >
                      <PauseCircle className="h-5 w-5 shrink-0 text-amber-300" />
                      <span className="flex-1">
                        <span className="block text-sm font-bold">Pause for a month</span>
                        <span className="block text-[11px] text-muted">Catch up on doses, keep your perks</span>
                      </span>
                    </button>
                    <button
                      onClick={() => run("skip", undefined, "Next delivery skipped instead ⏭️")}
                      className="glass flex w-full items-center gap-3 rounded-2xl p-4 text-left"
                    >
                      <SkipForward className="h-5 w-5 shrink-0 text-sky-300" />
                      <span className="flex-1">
                        <span className="block text-sm font-bold">Skip the next delivery</span>
                        <span className="block text-[11px] text-muted">No charge this cycle</span>
                      </span>
                    </button>
                    <button
                      onClick={() => { setSheet("swap"); }}
                      className="glass flex w-full items-center gap-3 rounded-2xl p-4 text-left"
                    >
                      <RefreshCw className="h-5 w-5 shrink-0 text-violet-300" />
                      <span className="flex-1">
                        <span className="block text-sm font-bold">Try a different product</span>
                        <span className="block text-[11px] text-muted">Same discount, new formula</span>
                      </span>
                    </button>
                  </div>
                  <button
                    onClick={() => setCancelStep(1)}
                    className="mt-4 w-full text-center text-sm font-semibold text-rose-300"
                  >
                    No thanks — cancel my subscription
                  </button>
                </>
              )}

              {sheet === "cancel" && cancelStep === 1 && (
                <>
                  <h2 className="font-display text-lg font-bold">Confirm cancellation</h2>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    Your subscription ends immediately. No further charges — ever. Your points and
                    progress stay saved, and you can reactivate any time.
                  </p>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => run("cancel", undefined, "Subscription canceled. You're always welcome back 💚")}
                    className="mt-5 w-full rounded-2xl bg-rose-500/90 py-4 font-display font-bold text-white"
                  >
                    {act.isPending ? "Canceling…" : "Yes, cancel my subscription"}
                  </motion.button>
                  <button onClick={() => setSheet(null)} className="mt-3 w-full text-center text-xs text-muted">
                    Keep my subscription
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <FadeUp delay={0.2} className="mt-4 px-5 text-center">
        <p className="text-[10px] text-white/25">
          Charges appear as NEONATURE*{product?.name.toUpperCase() ?? ""} on your statement ·{" "}
          {me?.demo.mode ? "Demo — no real charges" : ""}
        </p>
      </FadeUp>
    </div>
  );
}
