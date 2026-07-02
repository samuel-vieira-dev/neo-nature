"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/** Staggered fade-up entrance for page sections */
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
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.21, 0.65, 0.36, 1] }}
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
        className="glass flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:scale-90 transition-transform"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div>
        <h1 className="font-display text-xl font-bold">{title}</h1>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Animated circular progress ring */
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
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, progress))) }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#a3e635" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/** iOS-style toggle switch */
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 rounded-full transition-colors duration-300 ${on ? "grad" : "bg-white/10"}`}
      role="switch"
      aria-checked={on}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 32 }}
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-md ${on ? "left-6" : "left-1"}`}
      />
    </button>
  );
}

/** Status chip */
export function Chip({ tone, children }: { tone: "green" | "blue" | "amber" | "gray"; children: React.ReactNode }) {
  const tones = {
    green: "bg-emerald-400/15 text-emerald-300 border-emerald-400/20",
    blue: "bg-sky-400/15 text-sky-300 border-sky-400/20",
    amber: "bg-amber-400/15 text-amber-300 border-amber-400/20",
    gray: "bg-white/8 text-muted border-white/10",
  };
  return <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

/** Big gradient CTA button */
export function CTA({
  children,
  onClick,
  href,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const inner = (
    <motion.span
      whileTap={{ scale: 0.96 }}
      className={`grad glow flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-display text-base font-bold text-emerald-950 ${className}`}
    >
      {children}
    </motion.span>
  );
  if (href) return <Link href={href} className="block">{inner}</Link>;
  return (
    <button onClick={onClick} className="block w-full">
      {inner}
    </button>
  );
}
