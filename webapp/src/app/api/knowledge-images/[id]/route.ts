import { readKnowledgeImage } from "@/server/support-knowledge";
/** Public: published FAQ articles embed these images. IDs are random UUIDs; only validated raster types are stored. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const row = await readKnowledgeImage((await ctx.params).id);
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  return new Response(new Uint8Array(row.data), { headers: { "Content-Type": row.contentType, "Content-Disposition": "inline", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin" } });
}
