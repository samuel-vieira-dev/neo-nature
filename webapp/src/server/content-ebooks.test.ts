import { describe, expect, it } from "vitest";
import { canPublishEbook, ebookInput, nextEbookStatus, prepareEbookSnapshot, toReaderEbook, type EbookInput } from "./content-ebooks";
import { CONTENT_CATEGORIES } from "@/lib/content";

const input = (patch: Partial<EbookInput> = {}): EbookInput => ({
  title: "Sleep better after 45",
  summary: "Small habits for deeper rest.",
  category: "Sleep & Recovery",
  coverImageId: null,
  chapters: [{ id: "c1", title: "Why sleep changes", content: "<p>Rest <strong>matters</strong>.</p>" }],
  version: 0,
  action: "save",
  ...patch,
});
const status = async (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof Response ? { status: e.status, error: (await e.json()).error } : e; } return null; };

describe("content categories", () => {
  it("uses the catalog categories plus a general theme", () => {
    expect(CONTENT_CATEGORIES).toContain("Men's Health");
    expect(CONTENT_CATEGORIES).toContain("Sleep & Recovery");
    expect(CONTENT_CATEGORIES.at(-1)).toBe("Healthy Living");
    expect(new Set(CONTENT_CATEGORIES).size).toBe(CONTENT_CATEGORIES.length);
  });
});

describe("prepareEbookSnapshot", () => {
  it("sanitizes chapter HTML before storage", () => {
    const s = prepareEbookSnapshot(input({ chapters: [{ id: "c1", title: "One", content: "<p>Hi<script>alert(1)</script></p><img src=\"https://evil.test/x.png\">" }] }));
    expect(s.chapters[0].content).toBe("<p>Hi</p>");
  });

  it("rejects categories outside the content list", async () => {
    expect(await status(() => prepareEbookSnapshot(input({ category: "Crypto" })))).toEqual({ status: 400, error: "invalid_category" });
  });

  it("rejects duplicate chapter ids", async () => {
    const c = { id: "same", title: "A", content: "<p>x</p>" };
    expect(await status(() => prepareEbookSnapshot(input({ chapters: [c, c] })))).toEqual({ status: 400, error: "duplicate_chapter" });
  });

  it("lets drafts keep empty chapters but not reviews or publishing", async () => {
    const empty = [{ id: "c1", title: "", content: "" }];
    expect(prepareEbookSnapshot(input({ chapters: empty })).chapters).toHaveLength(1);
    expect(await status(() => prepareEbookSnapshot(input({ chapters: empty, action: "submit" })))).toEqual({ status: 400, error: "chapter_title_missing" });
    expect(await status(() => prepareEbookSnapshot(input({ chapters: [{ id: "c1", title: "T", content: "<p> </p>" }], action: "publish" })))).toEqual({ status: 400, error: "chapter_content_empty" });
  });

  it("caps the total length across chapters", async () => {
    const big = "x".repeat(100_000);
    const chapters = [{ id: "a", title: "A", content: big }, { id: "b", title: "B", content: big }];
    expect(await status(() => prepareEbookSnapshot(input({ chapters })))).toEqual({ status: 413, error: "ebook_too_long" });
  });
});

describe("ebookInput", () => {
  it("requires at least one chapter and a known action", () => {
    expect(ebookInput.safeParse(input({ chapters: [] })).success).toBe(false);
    expect(ebookInput.safeParse({ ...input(), action: "delete" }).success).toBe(false);
    expect(ebookInput.safeParse(input()).success).toBe(true);
  });

  it("only accepts uuid cover ids", () => {
    expect(ebookInput.safeParse(input({ coverImageId: "../../etc" })).success).toBe(false);
    expect(ebookInput.safeParse(input({ coverImageId: "0b6f2f8e-2f7a-4c55-9c39-6a2f5f3f9c11" })).success).toBe(true);
  });
});

describe("workflow", () => {
  it("maps each action to the working-copy stage", () => {
    expect(nextEbookStatus("save")).toBe("draft");
    expect(nextEbookStatus("submit")).toBe("in_review");
    expect(nextEbookStatus("publish")).toBe("published");
    expect(nextEbookStatus("unpublish")).toBe("draft");
  });

  it("lets only the author or an admin publish", () => {
    expect(canPublishEbook({ id: "a1", role: "admin" }, "someone-else")).toBe(true);
    expect(canPublishEbook({ id: "c1", role: "cs" }, "c1")).toBe(true);
    expect(canPublishEbook({ id: "c1", role: "cs" }, "c2")).toBe(false);
    expect(canPublishEbook({ id: "c1", role: "cs" }, null)).toBe(false);
  });
});

describe("toReaderEbook", () => {
  it("exposes sanitized HTML and the cover route, never raw content", () => {
    const r = toReaderEbook("e1", { ...prepareEbookSnapshot(input()), coverImageId: "0b6f2f8e-2f7a-4c55-9c39-6a2f5f3f9c11" });
    expect(r.coverUrl).toBe("/api/knowledge-images/0b6f2f8e-2f7a-4c55-9c39-6a2f5f3f9c11");
    expect(r.chapters[0]).toEqual({ id: "c1", title: "Why sleep changes", html: "<p>Rest <strong>matters</strong>.</p>" });
  });
});
