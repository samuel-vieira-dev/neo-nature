"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Bell, Package, Truck } from "lucide-react";
import { CTA } from "@/components/ui";
import InstallGuide from "@/components/InstallGuide";
import { ensurePushSubscription } from "@/lib/push";
import { useIsStandalone } from "@/lib/pwa";
import { useOrders } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import { humanizeStatus } from "@/lib/tracking";

const stepVariants = { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } };

/**
 * Lightweight first-run for a customer whose package hasn't arrived yet. The
 * full onboarding (goal, first dose, reminders) makes no sense without the
 * bottle in hand, so this only does what matters now: get the app on the home
 * screen, turn on notifications (shipping updates), then land on Home, which
 * shows the package tracking until they start the plan.
 */
export default function PreArrivalSetup() {
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useApp();
  const standalone = useIsStandalone();
  const { data: ordersData } = useOrders();
  // Already installed → skip the "add to home screen" step entirely.
  const steps = standalone ? ["welcome", "notify"] : ["welcome", "install", "notify"];
  const [step, setStep] = useState<(typeof steps)[number]>("welcome");
  const [busy, setBusy] = useState(false);

  const pending = ordersData?.orders.find((o) => o.awaitingArrival) ?? ordersData?.orders[0];
  const inTransit = pending?.status === "shipped";

  const next = () => setStep(steps[steps.indexOf(step) + 1] ?? "notify");

  const finish = async (pushOptIn: boolean) => {
    setBusy(true);
    if (pushOptIn) {
      const r = await ensurePushSubscription().catch(() => "unsupported" as const);
      if (r === "denied") toast("Notifications are off — you can turn them on later in Profile");
    }
    const res = await fetch("/api/onboarding/pre-arrival", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      toast("Something went wrong — try again");
      return;
    }
    await qc.invalidateQueries();
    router.push("/");
  };

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-10 pt-10">
      {/* progress */}
      <div className="mb-6 flex justify-center gap-2">
        {steps.map((s, i) => {
          const currentIdx = steps.indexOf(step);
          return (
            <span
              key={s}
              className="h-2 rounded-full transition-all duration-200"
              style={{ width: currentIdx === i ? 24 : 8, backgroundColor: currentIdx >= i ? "var(--accent)" : "var(--border)" }}
            />
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {step === "welcome" && (
          <motion.div key="welcome" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} className="flex flex-1 flex-col justify-center text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--accent)]">
              {inTransit ? <Truck className="h-10 w-10 text-white" /> : <Package className="h-10 w-10 text-white" />}
            </div>
            <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight text-[var(--text)]">
              Your order is <span className="text-[var(--accent)]">{inTransit ? "on its way" : "confirmed"}</span>
            </h1>
            <p className="mx-auto mt-3 max-w-72 text-base leading-relaxed text-muted">
              {pending
                ? `Order ${pending.number} · ${pending.items.map((i) => i.productName).join(", ") || "your Neo Nature order"}`
                : "We'll track your package here and get you set up the moment it arrives."}
            </p>
            {pending?.shippingStatus && <p className="mt-2 text-sm text-muted">{humanizeStatus(pending.shippingStatus)}</p>}
            <p className="mx-auto mt-4 max-w-72 text-sm text-muted">
              Until it lands, this app is your tracking page. Once the bottle is in your hands, we&apos;ll set up your daily plan together.
            </p>
            <div className="mt-8">
              <CTA onClick={next}>
                Let&apos;s go <ArrowRight className="h-4 w-4" />
              </CTA>
            </div>
          </motion.div>
        )}

        {step === "install" && (
          <motion.div key="install" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
            <h2 className="font-display text-2xl font-bold text-[var(--text)]">Keep Neo Nature one tap away</h2>
            <p className="mt-1 text-base text-muted">
              Add it to your home screen — no app store, no browser tabs to hunt for. That&apos;s also what lets us notify you when your package moves.
            </p>
            <div className="mt-5">
              <InstallGuide />
            </div>
            <div className="mt-6 space-y-3">
              <CTA onClick={next}>
                Continue <ArrowRight className="h-4 w-4" />
              </CTA>
              <button onClick={next} className="w-full text-center text-sm text-muted">
                Skip for now
              </button>
            </div>
          </motion.div>
        )}

        {step === "notify" && (
          <motion.div key="notify" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} className="flex flex-1 flex-col">
            <h2 className="font-display text-2xl font-bold text-[var(--text)]">Know the moment it ships</h2>
            <p className="mt-1 text-base text-muted">
              Turn on notifications and we&apos;ll tell you when your package is on the move and when it&apos;s out for delivery — nothing else until you want it.
            </p>
            <div className="card mt-6 flex items-center gap-4 rounded-2xl p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                <Bell className="h-6 w-6 text-[var(--accent)]" />
              </div>
              <div>
                <p className="font-display text-base font-bold text-[var(--text)]">Shipping updates</p>
                <p className="text-sm text-muted">Shipped · out for delivery · delivered</p>
              </div>
            </div>
            <div className="mt-auto space-y-3 pt-8">
              <CTA onClick={() => finish(true)} disabled={busy}>
                <Bell className="h-5 w-5" /> {busy ? "Setting up…" : "Turn on notifications"}
              </CTA>
              <button onClick={() => finish(false)} className="w-full text-center text-sm text-muted" disabled={busy}>
                Not now — take me to the app
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
