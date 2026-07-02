"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Home, ShoppingBag, Flame, BookOpen, User } from "lucide-react";
import { useApp } from "@/lib/store";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/shop", label: "Shop", icon: ShoppingBag },
  { href: "/streak", label: "Streak", icon: Flame, center: true },
  { href: "/learn", label: "Learn", icon: BookOpen },
  { href: "/profile", label: "Profile", icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { streak, hydrated } = useApp();

  return (
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-4 pb-4">
      <div className="glass-strong flex items-end justify-between rounded-3xl px-3 pb-2 pt-2 shadow-2xl">
        {tabs.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          if (tab.center) {
            return (
              <Link key={tab.href} href={tab.href} className="relative -mt-8 flex flex-col items-center">
                <motion.div
                  whileTap={{ scale: 0.88 }}
                  className={`grad glow flex h-14 w-14 items-center justify-center rounded-full ${active ? "ring-2 ring-lime-300/60" : ""}`}
                >
                  <Icon className="h-6 w-6 text-emerald-950" strokeWidth={2.5} />
                </motion.div>
                {hydrated && streak > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white shadow-lg">
                    {streak}
                  </span>
                )}
                <span className={`mt-1 text-[10px] font-medium ${active ? "text-emerald-300" : "text-muted"}`}>{tab.label}</span>
              </Link>
            );
          }

          return (
            <Link key={tab.href} href={tab.href} className="relative flex w-14 flex-col items-center gap-1 py-1">
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute -top-1 h-1 w-6 rounded-full grad"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <Icon className={`h-5 w-5 ${active ? "text-emerald-300" : "text-muted"}`} strokeWidth={active ? 2.4 : 2} />
              <span className={`text-[10px] font-medium ${active ? "text-emerald-300" : "text-muted"}`}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
