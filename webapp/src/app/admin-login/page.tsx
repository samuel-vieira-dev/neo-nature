"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, User as UserIcon, ArrowRight, ShieldCheck } from "lucide-react";

type ErrorBody = { error?: string; retryAfterSec?: number };

function errorMessage(status: number, body: ErrorBody): string {
  if (status === 401 && body.error === "invalid_setup_key") return "Wrong setup key — try again";
  if (status === 401) return "Wrong email or password";
  if (status === 429) {
    const mins = Math.max(1, Math.ceil((body.retryAfterSec ?? 60) / 60));
    return `Too many attempts — try again in ${mins} min`;
  }
  if (status === 409) return "An account already exists — reload the page";
  if (status === 400 && body.error) return body.error;
  return "Something went wrong — try again";
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState<boolean | null>(null);

  // first-access fields
  const [name, setName] = useState("");
  const [setupKey, setSetupKey] = useState("");
  // shared fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/admin-login")
      .then((r) => r.json())
      .then((d) => setBootstrap(!!d.bootstrap))
      .catch(() => setBootstrap(false));
  }, []);

  const submitLogin = async () => {
    if (!email || !password) return setError("Enter your email and password");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body: ErrorBody = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(errorMessage(res.status, body));
    router.push("/admin");
    router.refresh();
  };

  const submitBootstrap = async () => {
    if (!name || !email || !password || !setupKey) return setError("Fill in every field");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/admin-login", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, setupKey }),
    });
    const body: ErrorBody = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(errorMessage(res.status, body));
    router.push("/admin");
    router.refresh();
  };

  const submit = bootstrap ? submitBootstrap : submitLogin;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pb-16">
      <div className="text-center">
        <Image src="/logo.svg" alt="Neo Nature" width={200} height={33} priority className="mx-auto h-8 w-auto" />
        <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-bold text-[var(--accent)]">
          <ShieldCheck className="h-4 w-4" /> Admin panel
        </p>
      </div>

      <div className="mt-8 rounded-3xl border border-[var(--border)] bg-white p-5">
        {bootstrap === null ? (
          <p className="py-6 text-center text-sm text-muted">Loading…</p>
        ) : bootstrap ? (
          <>
            <p className="mb-4 text-center text-sm text-muted">First access — create the first admin account.</p>
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
              <UserIcon className="h-4 w-4" /> Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              className="mb-3 w-full min-h-[52px] rounded-2xl border border-[var(--border)] px-4 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
              <Mail className="h-4 w-4" /> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@neonature.com"
              className="mb-3 w-full min-h-[52px] rounded-2xl border border-[var(--border)] px-4 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
              <KeyRound className="h-4 w-4" /> Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 10 characters"
              className="mb-3 w-full min-h-[52px] rounded-2xl border border-[var(--border)] px-4 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
              <ShieldCheck className="h-4 w-4" /> Setup key
            </label>
            <input
              type="password"
              value={setupKey}
              onChange={(e) => setSetupKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Use the current admin password as the setup key"
              className="w-full min-h-[52px] rounded-2xl border border-[var(--border)] px-4 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </>
        ) : (
          <>
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
              <Mail className="h-4 w-4" /> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@neonature.com"
              autoFocus
              className="mb-3 w-full min-h-[52px] rounded-2xl border border-[var(--border)] px-4 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
              <KeyRound className="h-4 w-4" /> Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="••••••••"
              className="w-full min-h-[52px] rounded-2xl border border-[var(--border)] px-4 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </>
        )}

        {bootstrap !== null && (
          <button
            onClick={submit}
            disabled={busy}
            className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] font-display text-base font-bold text-white disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"} <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {error && <p className="mt-3 text-center text-sm text-rose-700">{error}</p>}
      </div>
    </div>
  );
}
