/** Content hub (e-books now, videos later): categories, limits and shapes shared by admin, webapp and server. */
import { products } from "@/lib/data";

/** Product categories from the catalog plus one general theme for content not tied to a product. */
export const CONTENT_CATEGORIES = [...new Set(products.map(p => p.category)), "Healthy Living"] as readonly string[];
export const isContentCategory = (value: string) => CONTENT_CATEGORIES.includes(value);

export const EBOOK_MAX_CHAPTERS = 40;
export const EBOOK_CHAPTER_TITLE_MAX = 160;
export const EBOOK_SUMMARY_MAX = 500;
/** Formatting included; keeps a full save under the 256 KB JSON body limit. */
export const EBOOK_CONTENT_MAX = 180_000;

export type EbookChapter = { id: string; title: string; content: string };
export type EbookSnapshot = { title: string; summary: string; category: string; coverImageId: string | null; chapters: EbookChapter[] };

export const EBOOK_STATUSES = ["draft", "in_review", "published"] as const;
export type EbookStatus = (typeof EBOOK_STATUSES)[number];
export const EBOOK_STATUS_LABELS: Record<EbookStatus, string> = { draft: "Draft", in_review: "In review", published: "Published" };
export const EBOOK_ACTIONS = ["save", "submit", "publish", "unpublish"] as const;
export type EbookAction = (typeof EBOOK_ACTIONS)[number];

/** What a customer reads: chapter HTML is already sanitized by the server (or by the admin preview). */
export type ReaderEbook = { id: string; title: string; summary: string; category: string; coverUrl: string | null; chapters: { id: string; title: string; html: string }[] };
