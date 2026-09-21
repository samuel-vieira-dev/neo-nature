"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

export default function PurchaseEmailGate({ children }: { children: React.ReactNode }) {
  const [confirmed, setConfirmed] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const access = useQuery({
    queryKey: ["purchase-email-access"],
    staleTime: 0,
    queryFn: async () => {
      const response = await fetch("/api/auth/purchase-email", { cache: "no-store" });
      if (!response.ok) throw new Error("We couldn't load your access. Please try again.");
      return await response.json() as { required: boolean };
    },
  });
  if (confirmed || access.data?.required === false) return children;
  if (access.isPending || access.isError) return <div className="px-5 py-10" role="status">{access.isError ? <><p>{access.error.message}</p><button className="min-h-14 font-bold" onClick={() => access.refetch()}>Try again</button></> : "Loading…"}</div>;
  return <form className="space-y-5 px-5 py-10" onSubmit={async e => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/purchase-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!response.ok) throw new Error(response.status === 429 ? "Too many attempts. Please wait 15 minutes and try again." : "Please enter the email used for your purchase.");
      setConfirmed(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Please try again."); }
    finally { setBusy(false); }
  }}>
    <h1 className="font-display text-2xl font-bold">Confirm your purchase email</h1>
    <p className="text-base text-muted">To request support or a refund, enter the email you used when placing your order.</p>
    <label className="block text-base font-semibold">Purchase email<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="card mt-2 min-h-14 w-full rounded-2xl p-4 text-base" /></label>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    <button disabled={busy} className="min-h-14 w-full rounded-2xl bg-[var(--accent)] p-4 text-lg font-bold text-white disabled:opacity-60">{busy ? "Checking…" : "Continue"}</button>
  </form>;
}
