import { z } from "zod";
import { db } from "@/db";
import { testimonials, pointsLedger } from "@/db/schema";
import { withUser } from "@/server/session";
import { appNow, addDays } from "@/server/time";

const schema = z.object({
  text: z.string().min(10).max(1000),
  consent: z.boolean(),
  photoId: z.number().optional(),
});

/** Captures a testimonial at the moment of a felt result — UGC gold for the brand */
export const POST = withUser(async (user, request: Request) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  await db.insert(testimonials).values({
    userId: user.id,
    text: parsed.data.text,
    consent: parsed.data.consent,
    photoId: parsed.data.photoId ?? null,
  });

  await db.insert(pointsLedger).values({
    userId: user.id,
    delta: 50,
    reason: "Shared your story",
    expiresAt: addDays(appNow(user), 120),
  });

  return Response.json({ ok: true });
});
