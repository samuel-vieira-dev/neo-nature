import { ShieldOff } from "lucide-react";

/** Shown when a page requires a permission the signed-in staff member lacks.
 *  The API already enforces this (403) — this is courtesy, so the page
 *  doesn't render a broken form the request would just reject. */
export default function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-6 py-16 text-center">
      <ShieldOff className="h-8 w-8 text-muted" />
      <p className="text-sm font-semibold text-[var(--text)]">You don&apos;t have access to this page.</p>
    </div>
  );
}
