"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";

export default function RefundEmailAccess({ orderId }: { orderId: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/refund/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, email }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error === "too_many_attempts" ? "Too many attempts. Please wait 15 minutes and try again." : "The order number and email do not match. Check the email used for your purchase.");
      router.replace(body.redirect);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn't verify your order. Please try again.");
      setBusy(false);
    }
  }
  return <div className="px-5 pt-12"><header className="mb-7"><p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">Neo Nature</p><h1 className="mt-2 font-display text-2xl font-bold">Confirm your purchase email</h1><p className="mt-2 text-muted">Enter the email used for order <strong>{orderId}</strong> to continue to the refund form.</p></header><form onSubmit={submit} className="space-y-4"><label className="block text-sm font-semibold">Purchase email<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="card mt-2 w-full rounded-2xl p-4 text-base" placeholder="you@example.com" /></label>{error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<button disabled={busy} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] p-4 font-bold text-white disabled:opacity-60">{busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Verifying…</> : "Continue to refund form"}</button><p className="flex items-center justify-center gap-2 text-center text-xs text-muted"><ShieldCheck className="h-4 w-4" /> Your information is encrypted and used only to verify this order.</p></form></div>;
}
