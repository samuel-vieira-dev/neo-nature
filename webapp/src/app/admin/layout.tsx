import { redirect } from "next/navigation";
import { getUser } from "@/server/session";
import { isAdminEmail } from "@/server/admin";
import AdminNav from "@/components/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!isAdminEmail(user?.email)) redirect("/login");

  return (
    <div className="min-h-dvh">
      <AdminNav />
      <div className="px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
