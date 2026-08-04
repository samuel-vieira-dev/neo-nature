"use client";

import { useState } from "react";
import Image from "next/image";
import { Share, SquarePlus, MoreVertical, MonitorDown, Smartphone, Monitor } from "lucide-react";
import { CTA } from "@/components/ui";
import { useInstallPrompt, detectPlatform, type Platform } from "@/lib/pwa";

const steps: Record<Platform, { icon: React.ElementType; text: string }[]> = {
  ios: [
    { icon: Share, text: "Tap the Share icon in the bottom bar" },
    { icon: SquarePlus, text: 'Scroll down and tap "Add to Home Screen"' },
    { icon: SquarePlus, text: 'Tap "Add" in the top right' },
  ],
  android: [
    { icon: MoreVertical, text: "Tap the menu (⋮) in the top right" },
    { icon: SquarePlus, text: 'Tap "Install app" or "Add to Home screen"' },
    { icon: SquarePlus, text: "Confirm to finish" },
  ],
  desktop: [
    { icon: MonitorDown, text: "Look for the install icon in the address bar" },
    { icon: MoreVertical, text: 'Or open the menu (⋮) and tap "Install Neo Nature"' },
  ],
};

const platformLabels: Record<Platform, string> = {
  ios: "iPhone / iPad",
  android: "Android",
  desktop: "Computer",
};

export default function InstallGuide() {
  const { canPrompt, promptInstall } = useInstallPrompt();
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform());

  if (canPrompt) {
    return (
      <div className="card rounded-2xl p-5 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white">
          <Image src="/icon-192.png" alt="Neo Nature" width={56} height={56} className="rounded-2xl" />
        </div>
        <p className="mt-4 text-base text-muted">
          One tap and Neo Nature lives on your home screen — no browser, no searching for the link.
        </p>
        <div className="mt-5">
          <CTA onClick={promptInstall}>Install Neo Nature</CTA>
        </div>
      </div>
    );
  }

  return (
    <div className="card rounded-2xl p-5">
      <p className="text-sm text-muted">
        Add Neo Nature to your home screen for one-tap access to your doses, orders and support.
      </p>

      <div className="mt-4 flex gap-2">
        {(Object.keys(platformLabels) as Platform[]).map((p) => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition-colors ${
              platform === p ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] text-muted"
            }`}
          >
            {p === "desktop" ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
            {platformLabels[p]}
          </button>
        ))}
      </div>

      {platform === "ios" && (
        <p className="mt-3 text-xs text-muted">Only works in Safari — the Add to Home Screen option isn&apos;t available in other iPhone browsers.</p>
      )}

      <ol className="mt-4 space-y-3">
        {steps[platform].map((s, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] font-display text-sm font-bold text-[var(--accent-strong)]">
              {i + 1}
            </span>
            <s.icon className="h-5 w-5 shrink-0 text-muted" />
            <span className="text-sm text-[var(--text)]">{s.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
