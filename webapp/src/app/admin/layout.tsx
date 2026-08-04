import { redirect } from "next/navigation";
import { getAdminUser } from "@/server/admin";
import AdminNav from "@/components/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();
  // Route through the logout handler instead of straight to /admin-login: the
  // cookie may hold a valid JWT for a user that no longer exists, and only a
  // Route Handler can clear it. Redirecting to /admin-login directly would
  // bounce off the proxy (which trusts the JWT) and loop.
  if (!admin) redirect("/api/auth/admin-logout");

  return (
    <div className="min-h-dvh">
      <AdminNav />
      <div className="px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
