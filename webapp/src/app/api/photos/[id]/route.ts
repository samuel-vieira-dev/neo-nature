import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { withUser } from "@/server/session";

export const GET = withUser(async (user, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const photo = await db.query.photos.findFirst({
    where: and(eq(photos.id, Number(id)), eq(photos.userId, user.id)),
  });
  if (!photo) return Response.json({ error: "not_found" }, { status: 404 });

  const buffer = Buffer.from(photo.dataBase64, "base64");
  return new Response(buffer, {
    headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=3600" },
  });
});
