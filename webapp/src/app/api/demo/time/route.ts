import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { withUser, isDemoMode } from "@/server/session";

const schema = z.object({
  delta: z.number().int().min(-90).max(90).optional(),
  reset: z.boolean().optional(),
});

/** Demo time travel: shifts this user's clock so time-based flows can be validated instantly */
export const POST = withUser(async (user, request: Request) => {
  if (!isDemoMode()) return Response.json({ error: "not_available" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const dayOffset = parsed.data.reset ? 0 : user.demoDayOffset + (parsed.data.delta ?? 0);
  await db.update(users).set({ demoDayOffset: dayOffset }).where(eq(users.id, user.id));
  return Response.json({ ok: true, dayOffset });
});
