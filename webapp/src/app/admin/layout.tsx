import { redirect } from "next/navigation";
import { getAdminUser } from "@/server/admin";
import AdminNav from "@/components/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin-login");

  return (
    <div className="min-h-dvh">
      <AdminNav />
      <div className="px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
