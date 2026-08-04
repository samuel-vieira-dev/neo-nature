import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { impersonatorId, sessionUserId } from "@/server/session";

// Lets the app shell show an "Impersonating <customer>" banner without
// exposing the target user's full session details.
export async function GET() {
  const adminId = await impersonatorId();
  if (!adminId) return Response.json({ impersonating: false });

  const [admin, target] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, adminId), columns: { name: true, email: true } }),
    (async () => {
      const uid = await sessionUserId();
      if (!uid) return null;
      return db.query.users.findFirst({ where: eq(users.id, uid), columns: { name: true, email: true } });
    })(),
  ]);

  return Response.json({
    impersonating: true,
    adminEmail: admin?.email ?? null,
    customerName: target?.name || target?.email || "customer",
  });
}
