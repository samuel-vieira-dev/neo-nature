"use client";

import { useEffect } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyStoredTheme, useTheme } from "@/lib/theme";
import type { ThemePreference } from "@/lib/theme-script";

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Automatic", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/** Mounted once in the root layout: restores data-theme if React re-renders <html> (hydration recovery). */
export function ThemeSync() {
  useEffect(() => applyStoredTheme(), []);
  return null;
}

/** Profile setting: Automatic follows the phone; Light/Dark pin the theme on this device. */
export function AppearancePicker() {
  const { preference, setPreference } = useTheme();
  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-2">
      {options.map((o) => {
        const active = preference === o.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(o.value)}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl border-2 text-sm font-semibold ${active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text)]"}`}
          >
            <o.icon className="h-5 w-5" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** One-tap switch between light and dark (reader, admin header). */
export function ThemeToggleButton({ className = "" }: { className?: string }) {
  const { theme, setPreference } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <button
      onClick={() => setPreference(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`card flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:scale-95 transition-transform ${className}`}
    >
      <Icon className="h-5 w-5 text-[var(--text)]" />
    </button>
  );
}
