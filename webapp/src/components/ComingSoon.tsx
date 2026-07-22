import Link from "next/link";
import { Sparkles } from "lucide-react";

/** Shown when a disabled surface (e.g. Shop) is reached directly. */
export default function ComingSoon({ title = "Coming soon" }: { title?: string }) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
        <Sparkles className="h-8 w-8 text-[var(--accent)]" />
      </div>
      <h1 className="mt-5 font-display text-2xl font-bold text-[var(--text)]">{title}</h1>
      <p className="mt-2 max-w-xs text-base text-muted">
        Our store is getting a fresh update. Check back soon to shop your favorites.
      </p>
      <Link
        href="/"
        className="mt-6 flex min-h-[52px] items-center justify-center rounded-2xl bg-[var(--accent)] px-8 text-base font-bold text-white"
      >
        Back to home
      </Link>
    </div>
  );
}
