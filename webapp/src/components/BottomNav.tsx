"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingBag, User } from "lucide-react";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/shop", label: "Shop", icon: ShoppingBag },
  { href: "/profile", label: "Profile", icon: User },
];

const HIDDEN_ON = ["/login", "/onboarding"];

export default function BottomNav() {
  const pathname = usePathname();

  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 border-t border-[var(--border)] bg-white px-2 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-1px_8px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-around">
        {tabs.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-1 flex-col items-center gap-1 py-2.5"
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={`h-6 w-6 ${active ? "text-[var(--accent)]" : "text-muted"}`}
                strokeWidth={active ? 2.4 : 2}
              />
              <span className={`text-[13px] font-semibold ${active ? "text-[var(--accent)]" : "text-muted"}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
