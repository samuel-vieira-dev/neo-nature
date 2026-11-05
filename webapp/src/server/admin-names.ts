import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";

export type AdminName = { name: string; email: string };

/** Staff name/e-mail for "edited by" lines; unknown or deleted accounts are simply absent. */
export async function adminNames(ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return new Map<string, AdminName>();
  const rows = await db.select({ id: adminUsers.id, name: adminUsers.name, email: adminUsers.email }).from(adminUsers).where(inArray(adminUsers.id, wanted));
  return new Map(rows.map(r => [r.id, { name: r.name, email: r.email }]));
}
