import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminActionLogs, supportKnowledgeArticles as articles, supportKnowledgeImages as images, supportKnowledgeRevisions as revisions } from "@/db/schema";
import { KNOWLEDGE_CONTENT_MAX, KNOWLEDGE_IMAGE_MAX_BYTES, isKnowledgeCategory, knowledgeImagePath, knowledgeToHtml, knowledgeToText, normalizeKnowledgeContent, sniffKnowledgeImage } from "@/lib/knowledge";
import type { AdminContext } from "./admin";
import { adminNames } from "./admin-names";

export const articleInput = z.object({ id: z.string().min(1).max(100).optional(), title: z.string().trim().min(3).max(200), content: z.string().trim().min(1).max(KNOWLEDGE_CONTENT_MAX), category: z.string().trim().min(1).max(80), channels: z.array(z.enum(["email", "webapp"])).min(1).max(2), version: z.number().int().min(0), action: z.enum(["save", "publish", "unpublish"]) }).strict();
// Drag & drop position first; articles never arranged follow, oldest id first as before.
const arranged = [sql`${articles.sortOrder} asc nulls last`, asc(articles.id)];
async function publishedRows(channel: "email" | "webapp") {
  const rows = await db.select({ id: articles.id, published: articles.published, version: articles.version, featured: articles.featured }).from(articles).orderBy(...arranged);
  return rows.filter(r => r.published?.channels.includes(channel));
}
export async function publishedKnowledge(channel: "email" | "webapp") {
  // `content` is plain text (AI prompts, guardrails); `html` is sanitized for the webapp.
  return (await publishedRows(channel)).map(r => ({ id: r.id, version: r.version, title: r.published!.title, content: knowledgeToText(r.published!.content), html: knowledgeToHtml(r.published!.content), category: r.published!.category }));
}
/** Webapp FAQ: the published articles plus the display-only featured flag. */
export async function webappKnowledge() {
  return (await publishedRows("webapp")).map(r => ({ id: r.id, title: r.published!.title, html: knowledgeToHtml(r.published!.content), category: r.published!.category, featured: r.featured }));
}
export async function listKnowledge() {
  const rows = await db.select().from(articles).orderBy(...arranged);
  const names = await adminNames(rows.map(r => r.updatedBy));
  return rows.map(r => ({ ...r, updatedByAdmin: r.updatedBy ? names.get(r.updatedBy) ?? null : null }));
}
export async function knowledgeHistory(id: string) {
  const rows = await db.select().from(revisions).where(eq(revisions.articleId, id)).orderBy(desc(revisions.version)).limit(50);
  const names = await adminNames(rows.map(r => r.adminId));
  return rows.map(r => ({ ...r, admin: r.adminId ? names.get(r.adminId) ?? null : null }));
}

export const arrangeInput = z.union([
  z.object({ order: z.array(z.string().min(1).max(100)).min(1).max(1000) }).strict(),
  z.object({ id: z.string().min(1).max(100), featured: z.boolean() }).strict(),
]);
/** Display-only changes (no new version): the full drag & drop order, or one featured flag. */
export async function arrangeKnowledge(input: z.infer<typeof arrangeInput>, admin: AdminContext) {
  const data = arrangeInput.parse(input);
  return db.transaction(async tx => {
    if ("order" in data) {
      if (new Set(data.order).size !== data.order.length) throw Response.json({ error: "duplicate_article" }, { status: 400 });
      const known = await tx.select({ id: articles.id }).from(articles).where(inArray(articles.id, data.order));
      if (known.length !== data.order.length) throw Response.json({ error: "article_not_found" }, { status: 404 });
      // One statement; ids not in the list keep their position (e.g. created meanwhile).
      await tx.execute(sql`update support_knowledge_articles a set sort_order = o.pos from unnest(array[${sql.join(data.order.map(id => sql`${id}`), sql`, `)}]::text[]) with ordinality as o(id, pos) where a.id = o.id`);
      await tx.insert(adminActionLogs).values({ adminUserId: admin.id, action: "support-knowledge.reorder", metadata: { count: data.order.length } });
    } else {
      const [row] = await tx.update(articles).set({ featured: data.featured }).where(eq(articles.id, data.id)).returning({ id: articles.id });
      if (!row) throw Response.json({ error: "article_not_found" }, { status: 404 });
      await tx.insert(adminActionLogs).values({ adminUserId: admin.id, action: data.featured ? "support-knowledge.feature" : "support-knowledge.unfeature", metadata: { articleId: data.id } });
    }
    return { ok: true };
  });
}
export async function saveKnowledge(input: z.infer<typeof articleInput>, admin: AdminContext) {
  const data = articleInput.parse(input);
  const id = data.id ?? crypto.randomUUID();
  const content = normalizeKnowledgeContent(data.content);
  if (!knowledgeToText(content).trim() && !content.includes("<img ")) throw Response.json({ error: "article_content_empty" }, { status: 400 });
  const snapshot = { title: data.title, content, category: data.category, channels: [...new Set(data.channels)] };
  return db.transaction(async tx => {
    const [current] = await tx.select().from(articles).where(eq(articles.id, id));
    // Legacy categories may be kept unchanged; any new choice must be one of the fixed categories.
    if (!isKnowledgeCategory(data.category) && data.category !== current?.category) throw Response.json({ error: "invalid_category" }, { status: 400 });
    const values = { ...snapshot, published: data.action === "publish" ? snapshot : data.action === "unpublish" ? null : current?.published ?? null, version: data.version + 1, updatedBy: admin.id, updatedAt: new Date() };
    const [row] = data.version === 0
      ? await tx.insert(articles).values({ id, ...values }).onConflictDoNothing().returning()
      : await tx.update(articles).set(values).where(and(eq(articles.id, id), eq(articles.version, data.version))).returning();
    if (!row) throw Response.json({ error: "article_changed_reload_before_saving" }, { status: 409 });
    await tx.insert(revisions).values({ articleId: id, version: row.version, snapshot, action: data.action, adminId: admin.id });
    await tx.insert(adminActionLogs).values({ adminUserId: admin.id, action: `support-knowledge.${data.action}`, metadata: { articleId: id, version: row.version } });
    return { ...row, updatedByAdmin: { name: admin.name, email: admin.email } };
  });
}

/** Shared by the knowledge base and the content hub (e-book covers and chapter images). */
export async function saveKnowledgeImage(file: File, admin: AdminContext, logAction = "support-knowledge.image_upload") {
  if (file.size <= 0 || file.size > KNOWLEDGE_IMAGE_MAX_BYTES) throw Response.json({ error: "image_too_large" }, { status: 413 });
  const data = Buffer.from(await file.arrayBuffer());
  if (data.length > KNOWLEDGE_IMAGE_MAX_BYTES) throw Response.json({ error: "image_too_large" }, { status: 413 });
  const contentType = sniffKnowledgeImage(data);
  if (!contentType) throw Response.json({ error: "unsupported_image_type" }, { status: 415 });
  const id = crypto.randomUUID();
  const filename = (file.name || "image").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  await db.transaction(async tx => {
    await tx.insert(images).values({ id, filename, contentType, size: data.length, data, createdBy: admin.id });
    await tx.insert(adminActionLogs).values({ adminUserId: admin.id, action: logAction, metadata: { imageId: id, contentType, size: data.length } });
  });
  return { id, url: knowledgeImagePath(id), contentType, size: data.length };
}
export async function readKnowledgeImage(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await db.select({ contentType: images.contentType, data: images.data }).from(images).where(eq(images.id, id));
  return row ?? null;
}
