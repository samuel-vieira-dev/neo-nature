"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Users, Send, Megaphone, ShieldCheck, UserCog, LogOut } from "lucide-react";
import { useAdmin } from "./AdminProvider";
import { ROLE_LABELS, type Permission } from "@/server/permissions";

const links: { href: string; label: string; icon: React.ElementType; exact?: boolean; permission?: Permission }[] = [
  { href: "/admin", label: "Customers", icon: Users, exact: true },
  { href: "/admin/push", label: "Push", icon: Send, permission: "push:send" },
  { href: "/admin/banners", label: "Banners", icon: Megaphone, permission: "banners:write" },
  { href: "/admin/access", label: "Access", icon: ShieldCheck, permission: "admins:manage" },
  { href: "/admin/account", label: "Account", icon: UserCog },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const admin = useAdmin();
  const adminLogout = async () => {
    await fetch("/api/auth/admin-logout", { method: "POST" });
    router.push("/admin-login");
    router.refresh();
  };

  const visibleLinks = links.filter((l) => !l.permission || admin.permissions.includes(l.permission));

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white/90 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <Image src="/logo.svg" alt="Neo Nature" width={130} height={21} className="h-5 w-auto" priority />
        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent)]">Admin</span>
        <nav className="ml-auto flex items-center gap-1">
          {visibleLinks.map((l) => {
            const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${
                  active ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-muted hover:bg-[var(--surface)]"
                }`}
              >
                <l.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{l.label}</span>
              </Link>
            );
          })}
          <div className="ml-2 hidden text-right leading-tight sm:block">
            <p className="text-xs font-semibold text-[var(--text)]">{admin.name || admin.email}</p>
            <p className="text-[10px] text-muted">{ROLE_LABELS[admin.role]}</p>
          </div>
          <button
            onClick={adminLogout}
            className="ml-1 flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-[var(--surface)]"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </nav>
      </div>
    </header>
  );
}
