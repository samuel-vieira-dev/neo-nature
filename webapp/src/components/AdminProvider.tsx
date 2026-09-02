"use client";

import { createContext, useContext } from "react";
import type { Permission, Role } from "@/server/permissions";

// ---------------------------------------------------------------------------
// Client-side identity of the signed-in staff member. Mounted once in
// src/app/admin/layout.tsx (a server component) from getAdminUser(), and
// deliberately stripped down to a client-safe shape — never the full
// AdminUser row (which carries passwordHash). Role/permissions here are a
// snapshot for the current page load; the server re-checks on every request
// (see src/server/admin.ts), so this is for UI gating only, never trust.
// ---------------------------------------------------------------------------

export type AdminIdentity = {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: readonly Permission[];
};

const AdminContext = createContext<AdminIdentity | null>(null);

export function AdminProvider({ admin, children }: { admin: AdminIdentity; children: React.ReactNode }) {
  return <AdminContext.Provider value={admin}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminIdentity {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin() must be used within <AdminProvider>");
  return ctx;
}

/** Whether the signed-in staff member holds a given permission. */
export function useCan(permission: Permission): boolean {
  return useAdmin().permissions.includes(permission);
}
