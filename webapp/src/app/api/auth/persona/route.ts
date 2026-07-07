import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, isDemoMode } from "@/server/session";

const bodySchema = z.object({ persona: z.enum(["michael", "jessica", "robert"]) });

/** Demo-only: one-tap login as a pre-seeded persona (each is a demo scenario) */
export async function POST(request: Request) {
  if (!isDemoMode()) return Response.json({ error: "not_available" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const user = await db.query.users.findFirst({ where: eq(users.id, parsed.data.persona) });
  if (!user) return Response.json({ error: "persona_not_seeded" }, { status: 404 });

  await createSession(user.id);
  return Response.json({ ok: true });
}
