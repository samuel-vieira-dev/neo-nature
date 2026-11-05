import { describe, expect, it } from "vitest";
import { groupByKnowledgeCategory, isKnowledgeCategory, knowledgeCategoryLabel, knowledgeToHtml, knowledgeToText, moveInOrder, normalizeKnowledgeContent, quickAnswers, sanitizeKnowledgeHtml, sniffKnowledgeImage } from "./knowledge";

const img = "/api/knowledge-images/0b5c3f4e-1a2b-4c3d-8e9f-0123456789ab";

describe("knowledge categories", () => {
  it("accepts only the fixed list and labels legacy/empty values gracefully", () => {
    expect(isKnowledgeCategory("Returns & Refunds")).toBe(true);
    expect(isKnowledgeCategory("General")).toBe(false);
    expect(knowledgeCategoryLabel("General")).toBe("General");
    expect(knowledgeCategoryLabel("  ")).toBe("Uncategorized");
    expect(knowledgeCategoryLabel(null)).toBe("Uncategorized");
  });
});

describe("sanitizeKnowledgeHtml", () => {
  it("keeps the allowlisted formatting and normalizes tags", () => {
    expect(sanitizeKnowledgeHtml(`<div><b>Bold</b> and <i>italic</i></div><p>x<br>y</p>`)).toBe("<p><strong>Bold</strong> and <em>italic</em></p><p>x<br>y</p>");
  });
  it("drops scripts, event handlers, styles and unknown tags", () => {
    const out = sanitizeKnowledgeHtml(`<p onclick="x()" style="color:red">Hi<script>alert(1)</script><iframe src="//evil"></iframe><span class="a">there</span></p><style>p{}</style>`);
    expect(out).toBe("<p>Hithere</p>");
  });
  it("allows only safe link protocols and forces rel/target", () => {
    expect(sanitizeKnowledgeHtml(`<a href="https://example.com/a?b=1&amp;c=2">ok</a>`)).toBe(`<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow">ok</a>`);
    for (const href of ["javascript:alert(1)", "java&#x09;script:alert(1)", " JAVASCRIPT:alert(1)", "data:text/html,x", "//evil.com", "/\\evil.com"]) {
      expect(sanitizeKnowledgeHtml(`<a href="${href}">x</a>`)).toBe("x");
    }
    expect(sanitizeKnowledgeHtml(`<a href="/refund">form</a>`)).toContain(`href="/refund"`);
  });
  it("only allows images served by our own image route", () => {
    expect(sanitizeKnowledgeHtml(`<img src="${img}" alt="A &quot;GIF&quot;" onerror="x()">`)).toBe(`<img src="${img}" alt="A &quot;GIF&quot;" loading="lazy">`);
    expect(sanitizeKnowledgeHtml(`<img src="https://evil.com/x.png"><img src="${img}/../x">`)).toBe("");
  });
  it("escapes stray markup and balances unclosed tags", () => {
    expect(sanitizeKnowledgeHtml(`<p>1 < 2 & "<x"`)).toBe("<p>1 &lt; 2 &amp; \"&lt;x\"</p>");
    expect(sanitizeKnowledgeHtml(`<strong><em>a</strong>b</em>`)).toBe("<strong><em>a</em></strong>b");
    expect(sanitizeKnowledgeHtml(`<img src=x onerror=alert(1)//`)).not.toContain("<img");
  });
});

describe("knowledge content conversion", () => {
  it("renders legacy plain text escaped with paragraphs", () => {
    expect(knowledgeToHtml("Line <1>\nnext\n\nSecond")).toBe("<p>Line &lt;1&gt;<br>next</p><p>Second</p>");
    expect(knowledgeToText("Plain <b-not-a-tag> text")).toBe("Plain <b-not-a-tag> text");
  });
  it("gives the AI plain text with link targets and image placeholders", () => {
    const html = `<p><strong>Refunds</strong> within 60 days. See <a href="https://app.beneonature.com/refund">the form</a>.</p><p><img src="${img}" alt="Steps"></p><ul><li>One &amp; two</li></ul>`;
    expect(knowledgeToText(html)).toBe("Refunds within 60 days. See the form (https://app.beneonature.com/refund).\n[image: Steps]\n- One & two");
  });
  it("normalizes rich content and trims plain text", () => {
    expect(normalizeKnowledgeContent("  plain  ")).toBe("plain");
    expect(normalizeKnowledgeContent(`<p>x<script>1</script></p>`)).toBe("<p>x</p>");
  });
});

describe("sniffKnowledgeImage", () => {
  it("detects types from magic bytes", () => {
    expect(sniffKnowledgeImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffKnowledgeImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffKnowledgeImage(new TextEncoder().encode("GIF89a...."))).toBe("image/gif");
    expect(sniffKnowledgeImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffKnowledgeImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe("knowledge arrangement", () => {
  const a = (id: string, featured = false, category = "Product Info") => ({ id, featured, category });

  it("shows featured articles as Quick answers, else the first five in order", () => {
    expect(quickAnswers([a("1"), a("2", true), a("3", true)]).map(x => x.id)).toEqual(["2", "3"]);
    expect(quickAnswers(["1", "2", "3", "4", "5", "6"].map(id => a(id))).map(x => x.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(quickAnswers([])).toEqual([]);
  });

  it("groups by the fixed categories in order, legacy ones last", () => {
    const groups = groupByKnowledgeCategory([a("1", false, "Returns & Refunds"), a("2", false, "General"), a("3", false, "Product Info"), a("4", false, "Returns & Refunds")]);
    expect(groups.map(g => [g.category, g.items.map(i => i.id)])).toEqual([["Product Info", ["3"]], ["Returns & Refunds", ["1", "4"]], ["More answers", ["2"]]]);
  });

  it("moves an article into the target's slot", () => {
    expect(moveInOrder(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moveInOrder(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveInOrder(["a", "b"], "a", "missing")).toEqual(["a", "b"]);
  });
});
