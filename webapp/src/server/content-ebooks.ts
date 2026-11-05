import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminActionLogs, adminUsers, contentEbookProgress as progress, contentEbookRevisions as revisions, contentEbooks as ebooks, supportKnowledgeImages as images } from "@/db/schema";
import { EBOOK_ACTIONS, EBOOK_CHAPTER_TITLE_MAX, EBOOK_CONTENT_MAX, EBOOK_MAX_CHAPTERS, EBOOK_SUMMARY_MAX, isContentCategory, type EbookAction, type EbookSnapshot, type EbookStatus, type ReaderEbook } from "@/lib/content";
import { knowledgeImagePath, knowledgeToHtml, knowledgeToText, normalizeKnowledgeContent } from "@/lib/knowledge";
import type { AdminContext } from "./admin";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const ebookInput = z.object({
  id: z.string().min(1).max(100).optional(),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(EBOOK_SUMMARY_MAX),
  category: z.string().trim().min(1).max(80),
  coverImageId: uuid.nullable(),
  chapters: z.array(z.object({ id: z.string().min(1).max(100), title: z.string().trim().max(EBOOK_CHAPTER_TITLE_MAX), content: z.string().max(EBOOK_CONTENT_MAX) }).strict()).min(1).max(EBOOK_MAX_CHAPTERS),
  version: z.number().int().min(0),
  action: z.enum(EBOOK_ACTIONS),
}).strict();
export type EbookInput = z.infer<typeof ebookInput>;

const fail = (error: string, status = 400) => Response.json({ error }, { status });
const hasBody = (html: string) => knowledgeToText(html).trim().length > 0 || html.includes("<img ");

/**
 * Normalizes the editor payload into a storable snapshot. Drafts may hold empty chapters;
 * anything sent to review or published must have a title and body in every chapter.
 */
export function prepareEbookSnapshot(input: EbookInput): EbookSnapshot {
  if (!isContentCategory(input.category)) throw fail("invalid_category");
  if (new Set(input.chapters.map(c => c.id)).size !== input.chapters.length) throw fail("duplicate_chapter");
  const chapters = input.chapters.map(c => ({ id: c.id, title: c.title, content: normalizeKnowledgeContent(c.content) }));
  if (chapters.reduce((n, c) => n + c.content.length, 0) > EBOOK_CONTENT_MAX) throw fail("ebook_too_long", 413);
  if (input.action === "submit" || input.action === "publish") {
    if (chapters.some(c => !c.title)) throw fail("chapter_title_missing");
    if (chapters.some(c => !hasBody(c.content))) throw fail("chapter_content_empty");
  }
  return { title: input.title, summary: input.summary, category: input.category, coverImageId: input.coverImageId, chapters };
}

/** Saving always returns the working copy to Draft; the live snapshot only changes on publish/unpublish. */
export function nextEbookStatus(action: EbookAction): EbookStatus {
  return action === "submit" ? "in_review" : action === "publish" ? "published" : "draft";
}

/** Publishing (and taking an e-book down) is limited to its author or an admin. */
export function canPublishEbook(admin: Pick<AdminContext, "id" | "role">, createdBy: string | null | undefined) {
  return admin.role === "admin" || (!!createdBy && createdBy === admin.id);
}

async function adminNames(ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return new Map<string, { name: string; email: string }>();
  const rows = await db.select({ id: adminUsers.id, name: adminUsers.name, email: adminUsers.email }).from(adminUsers).where(inArray(adminUsers.id, wanted));
  return new Map(rows.map(r => [r.id, { name: r.name, email: r.email }]));
}

export async function listEbooks() {
  const rows = await db.select().from(ebooks).orderBy(desc(ebooks.updatedAt));
  const names = await adminNames(rows.flatMap(r => [r.createdBy, r.updatedBy]));
  return rows.map(r => ({ ...r, createdByAdmin: r.createdBy ? names.get(r.createdBy) ?? null : null, updatedByAdmin: r.updatedBy ? names.get(r.updatedBy) ?? null : null }));
}

export async function ebookHistory(id: string) {
  const rows = await db.select().from(revisions).where(eq(revisions.ebookId, id)).orderBy(desc(revisions.version)).limit(100);
  const names = await adminNames(rows.map(r => r.adminId));
  return rows.map(r => ({ ...r, admin: r.adminId ? names.get(r.adminId) ?? null : null }));
}

export async function saveEbook(input: EbookInput, admin: AdminContext) {
  const data = ebookInput.parse(input);
  const snapshot = prepareEbookSnapshot(data);
  const id = data.id ?? crypto.randomUUID();
  return db.transaction(async tx => {
    const [current] = await tx.select().from(ebooks).where(eq(ebooks.id, id));
    if (data.version > 0 && !current) throw fail("ebook_not_found", 404);
    if ((data.action === "publish" || data.action === "unpublish") && !canPublishEbook(admin, current?.createdBy ?? admin.id)) throw fail("only_author_or_admin_can_publish", 409);
    if (data.action === "unpublish" && !current?.published) throw fail("ebook_not_published", 409);
    if (snapshot.coverImageId) {
      const [cover] = await tx.select({ id: images.id }).from(images).where(eq(images.id, snapshot.coverImageId));
      if (!cover) throw fail("cover_not_found");
    }
    const now = new Date();
    const status = nextEbookStatus(data.action);
    const live = data.action === "publish" ? snapshot : data.action === "unpublish" ? null : current?.published ?? null;
    const values = { ...snapshot, status, published: live, publishedAt: data.action === "publish" ? now : live ? current?.publishedAt ?? null : null, version: data.version + 1, updatedBy: admin.id, updatedAt: now };
    const [row] = data.version === 0
      ? await tx.insert(ebooks).values({ id, ...values, createdBy: admin.id, createdAt: now }).onConflictDoNothing().returning()
      : await tx.update(ebooks).set(values).where(and(eq(ebooks.id, id), eq(ebooks.version, data.version))).returning();
    if (!row) throw fail("ebook_changed_reload_before_saving", 409);
    await tx.insert(revisions).values({ ebookId: id, version: row.version, snapshot, status, action: data.action, adminId: admin.id });
    await tx.insert(adminActionLogs).values({ adminUserId: admin.id, action: `content-ebook.${data.action}`, metadata: { ebookId: id, version: row.version } });
    const names = await adminNames([row.createdBy, row.updatedBy]);
    return { ...row, createdByAdmin: row.createdBy ? names.get(row.createdBy) ?? null : null, updatedByAdmin: names.get(admin.id) ?? { name: admin.name, email: admin.email } };
  });
}

/** Customer-facing shape: sanitized HTML only, never the working copy. */
export function toReaderEbook(id: string, s: EbookSnapshot): ReaderEbook {
  return { id, title: s.title, summary: s.summary, category: s.category, coverUrl: s.coverImageId ? knowledgeImagePath(s.coverImageId) : null, chapters: s.chapters.map(c => ({ id: c.id, title: c.title, html: knowledgeToHtml(c.content) })) };
}

export async function publishedEbooks(userId: string) {
  const [rows, read] = await Promise.all([
    db.select({ id: ebooks.id, published: ebooks.published, publishedAt: ebooks.publishedAt }).from(ebooks).where(isNotNull(ebooks.published)).orderBy(desc(ebooks.publishedAt)),
    db.select({ ebookId: progress.ebookId, chapterId: progress.chapterId }).from(progress).where(eq(progress.userId, userId)),
  ]);
  const last = new Map(read.map(r => [r.ebookId, r.chapterId]));
  return rows.map(r => {
    const s = r.published!;
    const at = s.chapters.findIndex(c => c.id === last.get(r.id));
    return { id: r.id, title: s.title, summary: s.summary, category: s.category, coverUrl: s.coverImageId ? knowledgeImagePath(s.coverImageId) : null, chapterCount: s.chapters.length, resumeChapter: at >= 0 ? at : null };
  });
}

export async function publishedEbook(id: string, userId: string) {
  const [row] = await db.select({ published: ebooks.published }).from(ebooks).where(eq(ebooks.id, id));
  if (!row?.published) return null;
  const [read] = await db.select({ chapterId: progress.chapterId }).from(progress).where(and(eq(progress.userId, userId), eq(progress.ebookId, id)));
  const ebook = toReaderEbook(id, row.published);
  const at = ebook.chapters.findIndex(c => c.id === read?.chapterId);
  return { ebook, resumeChapter: at >= 0 ? at : 0 };
}

export async function saveEbookProgress(userId: string, ebookId: string, chapterId: string) {
  const [row] = await db.select({ published: ebooks.published }).from(ebooks).where(eq(ebooks.id, ebookId));
  if (!row?.published?.chapters.some(c => c.id === chapterId)) throw fail("chapter_not_found", 404);
  const now = new Date();
  await db.insert(progress).values({ userId, ebookId, chapterId, updatedAt: now }).onConflictDoUpdate({ target: [progress.userId, progress.ebookId], set: { chapterId, updatedAt: now } });
}
