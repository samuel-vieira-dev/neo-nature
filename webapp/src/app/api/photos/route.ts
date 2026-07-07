import { z } from "zod";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { withUser } from "@/server/session";

const schema = z.object({
  kind: z.enum(["first_dose", "progress", "ticket"]),
  mime: z.string().regex(/^image\/(jpeg|png|webp)$/),
  dataBase64: z.string().max(700_000), // client downscales to ≤800px JPEG first
});

export const POST = withUser(async (user, request: Request) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const [row] = await db
    .insert(photos)
    .values({ userId: user.id, ...parsed.data })
    .returning({ id: photos.id });

  return Response.json({ ok: true, id: row.id });
});
