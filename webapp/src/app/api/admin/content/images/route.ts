import { withAdmin } from "@/server/admin";
import { saveKnowledgeImage } from "@/server/support-knowledge";
import { KNOWLEDGE_IMAGE_MAX_BYTES } from "@/lib/knowledge";
/** E-book covers and chapter images share the knowledge image store and its public route. */
export const POST = withAdmin(async (admin, request: Request) => {
  if (Number(request.headers.get("content-length") ?? 0) > KNOWLEDGE_IMAGE_MAX_BYTES + 64 * 1024) return Response.json({ error: "image_too_large" }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "invalid_image" }, { status: 400 });
  return Response.json(await saveKnowledgeImage(file, admin, "content.image_upload"));
}, "content:write");
