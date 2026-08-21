"use client";

import Link from "next/link";
import confetti from "canvas-confetti";
import { Bell, Check, Flame, Truck, LifeBuoy, History, ChevronRight, Pill, Leaf, ArrowRight } from "lucide-react";
import { useApp } from "@/lib/store";
import { useMe, useOrders, useCheckIn } from "@/lib/hooks";
import { FadeUp, CTA } from "@/components/ui";
import Banner from "@/components/Banner";
import OrderTrackingCard from "@/components/OrderTrackingCard";
import { productById } from "@/lib/data";
import { firstNameOf } from "@/lib/name";

export default function Home() {
  const { toast } = useApp();
  const { data: me } = useMe();
  const { data: ordersData } = useOrders();
  const checkInMutation = useCheckIn();

  const hydrated = !!me;
  // greet with the first name only, even when BuyGoods gave us a full name
  const firstName = firstNameOf(me?.user.name || me?.user.fullName);
  const streak = me?.streak ?? 0;
  const checkedInToday = me?.checkedInToday ?? false;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const activeOrder = ordersData?.orders.find((o) => o.status === "confirmed" || o.status === "shipped");
  // Pre-arrival mode: the customer hasn't done the full onboarding yet (their
  // package wasn't in hand when they first signed in). No dose button, streak
  // or bottle forecast — the package is the whole story until it lands. Both
  // layouts wait for /api/me so the wrong one never flashes first.
  const preArrival = hydrated && !me.user.onboarded;
  const packageOrder = ordersData?.orders.find((o) => o.awaitingArrival) ?? activeOrder ?? ordersData?.orders[0];
  const bottleProduct = me?.bottle ? productById(me.bottle.productId) : null;
  const runsOutLabel = me?.bottle
    ? new Date(me.bottle.runsOutAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  const handleCheckIn = () => {
    if (checkedInToday || checkInMutation.isPending) return;
    checkInMutation.mutate(undefined, {
      onSuccess: (res) => {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.55 },
          colors: ["#047857", "#34d399"],
        });
        toast(`Day ${res.streak} logged!`);
      },
    });
  };

  return (
    <div className="px-5 pt-8">
      {/* header */}
      <FadeUp className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">{greeting},</p>
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">{firstName || "…"}</h1>
        </div>
        <Link
          href="/notifications"
          className="card relative flex h-11 w-11 items-center justify-center rounded-full active:scale-95 transition-transform"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {hydrated && (me?.unread ?? 0) > 0 && (
            <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-amber-600 ring-2 ring-white" />
          )}
        </Link>
      </FadeUp>

      {/* banner */}
      <FadeUp delay={0.04} className="mt-5">
        <Banner />
      </FadeUp>

      {!hydrated ? null : preArrival ? (
        <>
          {/* package tracking — the headline while the order is on its way */}
          <FadeUp delay={0.08} className="mt-4">
            {packageOrder ? (
              <OrderTrackingCard order={packageOrder} />
            ) : ordersData ? (
              <div className="card rounded-3xl p-5 text-center">
                <p className="font-display text-lg font-bold text-[var(--text)]">No order on file yet</p>
                <p className="mt-1 text-sm text-muted">
                  Your order will appear here automatically once it&apos;s confirmed. Bought with a different phone number?
                  Support can link it for you.
                </p>
              </div>
            ) : null}
          </FadeUp>

          {/* start the plan once the bottle is in hand */}
          <FadeUp delay={0.12} className="mt-4">
            <Link href="/onboarding?setup=full" className="block">
              <div
                className={`flex min-h-[64px] items-center gap-3 rounded-2xl px-5 py-4 ${
                  packageOrder && !packageOrder.awaitingArrival
                    ? "bg-[var(--accent)] text-white"
                    : "card text-[var(--text)]"
                }`}
              >
                <Leaf className={`h-6 w-6 shrink-0 ${packageOrder && !packageOrder.awaitingArrival ? "text-white" : "text-[var(--accent)]"}`} />
                <span className="flex-1">
                  <span className="block font-display text-base font-bold">
                    {packageOrder && !packageOrder.awaitingArrival ? "Your package should be there — start your plan" : "Got your package? Start your plan"}
                  </span>
                  <span className={`block text-sm ${packageOrder && !packageOrder.awaitingArrival ? "text-white/85" : "text-muted"}`}>
                    Two minutes: your goal, your first dose, your reminders.
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0" />
              </div>
            </Link>
          </FadeUp>
        </>
      ) : (
        <>
          {/* churn message */}
          {me?.user.churnFlag && !checkedInToday && (
            <FadeUp delay={0.06} className="mt-4">
              <p className="text-center text-sm font-semibold text-[var(--accent)]">
                We missed you, {firstName} — pick it back up today.
              </p>
            </FadeUp>
          )}

          {/* big dose button */}
          <FadeUp delay={0.08} className="mt-4">
            {checkedInToday ? (
              <div className="flex min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent-soft)] px-6 py-4 font-display text-lg font-bold text-[var(--accent-strong)]">
                <Check className="h-6 w-6" /> Done for today!
              </div>
            ) : (
              <CTA onClick={handleCheckIn} className="min-h-[64px] text-lg">
                <Flame className="h-6 w-6" fill="currentColor" />
                {checkInMutation.isPending ? "Logging…" : "I took my dose today"}
              </CTA>
            )}
          </FadeUp>

          {/* streak count */}
          <FadeUp delay={0.11} className="mt-4">
            <div className="card flex items-center gap-4 rounded-2xl p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                <Flame className="h-6 w-6 text-amber-600" fill="currentColor" />
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-[var(--text)]">{hydrated ? streak : "–"} days in a row</p>
                <p className="text-sm text-muted">Keep showing up — it adds up.</p>
              </div>
            </div>
          </FadeUp>

          {/* doses left */}
          {me?.bottle && bottleProduct && (
            <FadeUp delay={0.14} className="mt-4">
              <div className="card rounded-2xl p-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                    <Pill className="h-6 w-6 text-[var(--accent)]" />
                  </div>
                  <div>
                    <p className="font-display text-lg font-bold text-[var(--text)]">
                      {me.bottle.daysLeft > 0 ? (
                        <>≈ {me.bottle.daysLeft} days of doses left</>
                      ) : (
                        "Bottle is empty"
                      )}
                    </p>
                    <p className="text-sm text-muted">
                      {bottleProduct.name}
                      {me.bottle.daysLeft > 0 && runsOutLabel && <> · runs out {runsOutLabel}</>}
                    </p>
                  </div>
                </div>
                {me.bottle.daysLeft <= 7 && (
                  <Link
                    href="/shop"
                    className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-sm font-bold text-amber-800"
                  >
                    Running low — reorder soon
                  </Link>
                )}
              </div>
            </FadeUp>
          )}
        </>
      )}

      {/* nav buttons */}
      <FadeUp delay={0.18} className="mt-6 space-y-3">
        {!preArrival && (
          <Link
            href={activeOrder ? `/orders/${activeOrder.id}` : "/orders"}
            className="card flex min-h-[56px] items-center gap-3 rounded-2xl px-5 py-4"
          >
            <Truck className="h-5 w-5 text-[var(--accent)]" />
            <span className="flex-1 font-display text-base font-bold text-[var(--text)]">Track my package</span>
            <ChevronRight className="h-5 w-5 text-muted" />
          </Link>
        )}
        <Link href="/orders" className="card flex min-h-[56px] items-center gap-3 rounded-2xl px-5 py-4">
          <History className="h-5 w-5 text-[var(--accent)]" />
          <span className="flex-1 font-display text-base font-bold text-[var(--text)]">My orders</span>
          <ChevronRight className="h-5 w-5 text-muted" />
        </Link>
        <Link href="/support" className="card flex min-h-[56px] items-center gap-3 rounded-2xl px-5 py-4">
          <LifeBuoy className="h-5 w-5 text-[var(--accent)]" />
          <span className="flex-1 font-display text-base font-bold text-[var(--text)]">Support</span>
          <ChevronRight className="h-5 w-5 text-muted" />
        </Link>
      </FadeUp>
    </div>
  );
}
