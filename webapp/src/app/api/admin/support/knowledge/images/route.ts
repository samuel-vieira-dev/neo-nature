import { withAdmin } from "@/server/admin";
import { saveKnowledgeImage } from "@/server/support-knowledge";
import { KNOWLEDGE_IMAGE_MAX_BYTES } from "@/lib/knowledge";
export const POST = withAdmin(async (admin, request: Request) => {
  // Reject oversized bodies before buffering the multipart payload.
  if (Number(request.headers.get("content-length") ?? 0) > KNOWLEDGE_IMAGE_MAX_BYTES + 64 * 1024) return Response.json({ error: "image_too_large" }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "invalid_image" }, { status: 400 });
  return Response.json(await saveKnowledgeImage(file, admin));
}, "tickets:write");
