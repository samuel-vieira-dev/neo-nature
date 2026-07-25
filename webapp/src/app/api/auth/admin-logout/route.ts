import { destroyAdminSession } from "@/server/session";

export async function POST() {
  await destroyAdminSession();
  return Response.json({ ok: true });
}
