"use client";

import { Megaphone } from "lucide-react";
import { useBanner } from "@/lib/hooks";

/** Communication banner at the top of Home, fed by the `banners` table. No dismiss — kept simple for 45+. */
export default function Banner() {
  const { data } = useBanner();
  const banner = data?.banner;
  if (!banner) return null;

  return (
    <div className="card flex items-start gap-3 rounded-2xl p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
        <Megaphone className="h-5 w-5 text-[var(--accent)]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-bold text-[var(--text)]">{banner.title}</p>
        <p className="mt-0.5 text-sm leading-snug text-muted">{banner.body}</p>
        {banner.ctaLabel && banner.ctaUrl && (
          <a href={banner.ctaUrl} className="mt-2 inline-block text-sm font-bold text-[var(--accent)]">
            {banner.ctaLabel} →
          </a>
        )}
      </div>
    </div>
  );
}
