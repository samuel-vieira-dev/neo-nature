import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { withUser } from "@/server/session";

const schema = z.object({
  doseReminder: z.boolean().optional(),
  orderUpdates: z.boolean().optional(),
  newContent: z.boolean().optional(),
  offers: z.boolean().optional(),
});

export const PATCH = withUser(async (user, request: Request) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const prefs = { ...user.prefs, ...parsed.data };
  await db.update(users).set({ prefs }).where(eq(users.id, user.id));
  return Response.json({ ok: true, prefs });
});
