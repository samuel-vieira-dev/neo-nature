import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminActionLogs, supportKnowledgeArticles as articles, supportKnowledgeRevisions as revisions } from "@/db/schema";
import type { AdminContext } from "./admin";

export const articleInput = z.object({ id: z.string().min(1).max(100).optional(), title: z.string().trim().min(3).max(200), content: z.string().trim().min(1).max(12000), category: z.string().trim().min(1).max(80), channels: z.array(z.enum(["email", "webapp"])).min(1).max(2), version: z.number().int().min(0), action: z.enum(["save", "publish", "unpublish"]) }).strict();
export async function publishedKnowledge(channel: "email" | "webapp") {
  const rows = await db.select({ id: articles.id, published: articles.published, version: articles.version }).from(articles).orderBy(asc(articles.id));
  return rows.filter(r => r.published?.channels.includes(channel)).map(r => ({ id: r.id, version: r.version, title: r.published!.title, content: r.published!.content, category: r.published!.category }));
}
export async function listKnowledge() {
  return db.select().from(articles).orderBy(desc(articles.updatedAt), asc(articles.id));
}
export async function knowledgeHistory(id: string) {
  return db.select().from(revisions).where(eq(revisions.articleId, id)).orderBy(desc(revisions.version)).limit(50);
}
export async function saveKnowledge(input: z.infer<typeof articleInput>, admin: AdminContext) {
  const data = articleInput.parse(input);
  const id = data.id ?? crypto.randomUUID();
  const snapshot = { title: data.title, content: data.content, category: data.category, channels: [...new Set(data.channels)] };
  return db.transaction(async tx => {
    const [current] = await tx.select().from(articles).where(eq(articles.id, id));
    const values = { ...snapshot, published: data.action === "publish" ? snapshot : data.action === "unpublish" ? null : current?.published ?? null, version: data.version + 1, updatedBy: admin.id, updatedAt: new Date() };
    const [row] = data.version === 0
      ? await tx.insert(articles).values({ id, ...values }).onConflictDoNothing().returning()
      : await tx.update(articles).set(values).where(and(eq(articles.id, id), eq(articles.version, data.version))).returning();
    if (!row) throw Response.json({ error: "article_changed_reload_before_saving" }, { status: 409 });
    await tx.insert(revisions).values({ articleId: id, version: row.version, snapshot, action: data.action, adminId: admin.id });
    await tx.insert(adminActionLogs).values({ adminUserId: admin.id, action: `support-knowledge.${data.action}`, metadata: { articleId: id, version: row.version } });
    return row;
  });
}
