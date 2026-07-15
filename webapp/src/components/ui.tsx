"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/** Short fade-in for page sections — kept brief for a 45+ audience (no slides/springs) */
export function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Page header with back button */
export function PageHeader({ title, subtitle, backHref }: { title: string; subtitle?: string; backHref?: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-3 px-5 pt-6 pb-4">
      <button
        onClick={() => (backHref ? router.push(backHref) : router.back())}
        className="card flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:scale-95 transition-transform"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div>
        <h1 className="font-display text-xl font-bold text-[var(--text)]">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Circular progress ring */
export function ProgressRing({
  progress,
  size = 64,
  stroke = 5,
  children,
}: {
  progress: number; // 0..1
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, progress))) }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/** Toggle switch */
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${on ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
      role="switch"
      aria-checked={on}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${on ? "left-6" : "left-1"}`}
      />
    </button>
  );
}

/** Status chip */
export function Chip({ tone, children }: { tone: "green" | "blue" | "amber" | "gray"; children: React.ReactNode }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    blue: "bg-sky-50 text-sky-800 border-sky-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    gray: "bg-[var(--surface)] text-muted border-[var(--border)]",
  };
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

/** Big solid CTA button — min-height 56px per the 45+ design spec */
export function CTA({
  children,
  onClick,
  href,
  className = "",
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
  variant?: "primary" | "secondary";
}) {
  const styles =
    variant === "primary"
      ? "bg-[var(--accent)] text-white active:bg-[var(--accent-strong)]"
      : "card text-[var(--text)]";
  const inner = (
    <span
      className={`flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-display text-base font-bold transition-colors active:scale-[0.98] ${styles} ${className}`}
    >
      {children}
    </span>
  );
  if (href) return <Link href={href} className="block">{inner}</Link>;
  return (
    <button onClick={onClick} className="block w-full">
      {inner}
    </button>
  );
}
