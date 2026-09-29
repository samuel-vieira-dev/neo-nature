import { redirect } from "next/navigation";
import { getAdminUser } from "@/server/admin";
import { hasPermission } from "@/server/permissions";

export default async function AreaLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();
  if (!admin) redirect("/api/auth/admin-logout");
  if (!hasPermission(admin.role, "support:read")) redirect("/admin");
  return children;
}
