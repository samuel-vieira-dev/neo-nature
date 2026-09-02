import { redirect } from "next/navigation";
import { getAdminUser } from "@/server/admin";
import { hasPermission } from "@/server/permissions";
import CrmPage from "@/components/admin/CrmPage";

// The CRM list (LTV, attribution, revenue) is admin-only now — CS works out
// of /admin/support instead (see PLANO-CS-DESK.md §3.2). AdminLayout already
// guarantees a signed-in admin here, so this only needs the role check.
export default async function AdminPage() {
  const admin = await getAdminUser();
  if (!admin || !hasPermission(admin.role, "analytics:read")) redirect("/admin/support");
  return <CrmPage />;
}
