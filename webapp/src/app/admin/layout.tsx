import { redirect } from "next/navigation";
import { getAdminUser } from "@/server/admin";
import { AdminProvider, type AdminIdentity } from "@/components/AdminProvider";
import AdminNav from "@/components/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();
  // Route through the logout handler instead of straight to /admin-login: the
  // cookie may hold a valid JWT for a user that no longer exists, and only a
  // Route Handler can clear it. Redirecting to /admin-login directly would
  // bounce off the proxy (which trusts the JWT) and loop.
  if (!admin) redirect("/api/auth/admin-logout");

  // Client-safe identity only — never pass the full row (it carries
  // passwordHash) across the server/client boundary.
  const identity: AdminIdentity = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    permissions: admin.permissions,
  };

  return (
    <AdminProvider admin={identity}>
      <div className="min-h-dvh">
        <AdminNav />
        <div className="px-4 py-6 sm:px-6">{children}</div>
      </div>
    </AdminProvider>
  );
}
