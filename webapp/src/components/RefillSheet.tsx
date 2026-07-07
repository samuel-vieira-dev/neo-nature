"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Check, Lock, PackageCheck, Plus, Zap } from "lucide-react";
import { useRefill } from "@/lib/hooks";
import Bottle from "@/components/Bottle";
import { productById, pairsWith } from "@/lib/data";

export default function RefillSheet({
  open,
  onClose,
  productId,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
}) {
  const refill = useRefill();
  const [addUpsell, setAddUpsell] = useState(false);
  const [done, setDone] = useState<{ number: string; orderId: string } | null>(null);

  const product = productById(productId);
  const upsell = productById(pairsWith[productId] ?? "");
  if (!product) return null;

  const total = product.price + (addUpsell && upsell ? upsell.price : 0);

  const confirm = () => {
    refill.mutate(
      { productId: product.id, upsellProductIds: addUpsell && upsell ? [upsell.id] : [] },
      {
        onSuccess: (res) => {
          setDone({ number: res.number, orderId: res.orderId });
          confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 }, colors: ["#10b981", "#a3e635"] });
        },
      }
    );
  };

  const close = () => {
    onClose();
    setTimeout(() => {
      setDone(null);
      setAddUpsell(false);
    }, 300);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={close}
        >
          <motion.div
            initial={{ y: 400 }}
            animate={{ y: 0 }}
            exit={{ y: 400 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#0d1512] p-6 pb-10"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />

            {done ? (
              <div className="text-center">
                <div className="grad glow mx-auto flex h-20 w-20 items-center justify-center rounded-full">
                  <PackageCheck className="h-9 w-9 text-emerald-950" />
                </div>
                <h2 className="mt-4 font-display text-2xl font-bold">Refill confirmed!</h2>
                <p className="mt-1 text-sm text-muted">Order {done.number} arrives in ~5 days.</p>
                <Link
                  href={`/orders/${done.orderId}`}
                  onClick={close}
                  className="grad glow mt-5 block w-full rounded-2xl py-4 text-center font-display font-bold text-emerald-950"
                >
                  Track my order
                </Link>
                <button onClick={close} className="mt-3 w-full text-center text-xs text-muted">
                  Done
                </button>
              </div>
            ) : (
              <>
                <h2 className="font-display text-lg font-bold">One-tap refill</h2>
                <p className="mt-1 text-xs text-muted">Never break the chain — your next bottle, sorted.</p>

                <div className="glass mt-4 flex items-center gap-3 rounded-2xl p-4">
                  <Bottle accent={product.accent} label={product.short} className="h-16 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-bold">{product.name}</p>
                    <p className="text-[11px] text-muted">
                      {product.capsules} capsules · {Math.floor(product.capsules / product.dosePerDay)}-day supply
                    </p>
                  </div>
                  <p className="font-display text-lg font-bold">${product.price}</p>
                </div>

                {/* upsell at the moment of highest intent */}
                {upsell && (
                  <button
                    onClick={() => setAddUpsell(!addUpsell)}
                    className={`mt-3 flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
                      addUpsell ? "border-emerald-400/40 bg-emerald-400/8" : "border-dashed border-white/15"
                    }`}
                  >
                    <Bottle accent={upsell.accent} label={upsell.short} className="h-14 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                        <Zap className="h-3 w-3" fill="currentColor" /> Pairs perfectly
                      </span>
                      <span className="block text-sm font-bold">{upsell.name}</span>
                      <span className="block truncate text-[11px] text-muted">{upsell.tagline}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="font-display text-sm font-bold">+${upsell.price}</span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full ${
                          addUpsell ? "grad" : "border border-white/20"
                        }`}
                      >
                        {addUpsell ? <Check className="h-3.5 w-3.5 text-emerald-950" strokeWidth={3} /> : <Plus className="h-3.5 w-3.5 text-white/40" />}
                      </span>
                    </span>
                  </button>
                )}

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={confirm}
                  className="grad glow mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-display font-bold text-emerald-950"
                >
                  <Lock className="h-4 w-4" />
                  {refill.isPending ? "Placing order…" : `Confirm refill — $${total}`}
                </motion.button>
                <p className="mt-2 text-center text-[10px] text-white/30">
                  Demo — secure checkout via BuyGoods in production 🔒
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
