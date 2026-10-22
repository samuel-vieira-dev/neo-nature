/** Knowledge base categories and the rich-text (HTML) subset shared by admin, webapp and AI. */
export const KNOWLEDGE_CATEGORIES = ["Product Info", "Checkout & Billing", "Shipping & Delivery", "Account & Customer Support", "Returns & Refunds"] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];
export const UNCATEGORIZED = "Uncategorized";
export const KNOWLEDGE_CONTENT_MAX = 40_000;
/** Tailwind descendant styles for rendered article HTML. */
export const RICH_TEXT = "[&_a]:font-semibold [&_a]:text-[var(--accent)] [&_a]:underline [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_strong]:text-[var(--text)] [&_ul]:list-disc [&_ul]:pl-5";

export function isKnowledgeCategory(value: string): value is KnowledgeCategory {
  return (KNOWLEDGE_CATEGORIES as readonly string[]).includes(value);
}
/** Legacy/empty categories are kept as stored; only the label shown falls back to "Uncategorized". */
export function knowledgeCategoryLabel(value: string | null | undefined) {
  return value?.trim() || UNCATEGORIZED;
}

export const KNOWLEDGE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export const KNOWLEDGE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const knowledgeImagePath = (id: string) => `/api/knowledge-images/${id}`;
const IMAGE_SRC = /^\/api\/knowledge-images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Detects the real image type from magic bytes; the client-declared MIME type is ignored. */
export function sniffKnowledgeImage(bytes: Uint8Array): (typeof KNOWLEDGE_IMAGE_TYPES)[number] | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

const RICH_TAG = /<(?:p|br|strong|b|em|i|a|img|ul|ol|li|div)(?=[\s/>])[^>]*>/i;
/** Articles saved before the rich editor are plain text and stay plain text. */
export const isRichKnowledge = (content: string) => RICH_TAG.test(content);

const escapeText = (s: string) => s.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#x[0-9a-fA-F]{1,6});)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]+);/g, (whole, e: string) => {
    if (e[0] !== "#") return NAMED[e.toLowerCase()] ?? whole;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}
function safeHref(raw: string) {
  const value = decodeEntities(raw).replace(/[\u0000-\u0020\u007f]+/g, "");
  if (/^\/(?![/\\])/.test(value)) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
function attributes(raw: string) {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript", "textarea", "title", "svg", "math", "select", "head"]);
const RENAME: Record<string, string> = { b: "strong", i: "em", div: "p" };
const CONTAINERS = new Set(["p", "strong", "em", "a", "ul", "ol", "li"]);
const TOKEN = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*'){0,2000})>/g;

/**
 * Allowlist sanitizer: output is rebuilt only from permitted tags/attributes; all other
 * markup is dropped and text is re-escaped. Images must point at our own image route.
 */
export function sanitizeKnowledgeHtml(html: string) {
  let out = "";
  const stack: string[] = [];
  let skipUntil: string | null = null;
  let last = 0;
  const text = (s: string) => { if (!skipUntil) out += escapeText(s); };
  for (const m of html.matchAll(TOKEN)) {
    text(html.slice(last, m.index));
    last = m.index + m[0].length;
    if (!m[2]) continue; // comment
    const closing = m[1] === "/";
    const raw = m[2].toLowerCase();
    if (skipUntil) { if (closing && raw === skipUntil) skipUntil = null; continue; }
    if (DROP_WITH_CONTENT.has(raw)) { if (!closing && !/\/\s*$/.test(m[3])) skipUntil = raw; continue; }
    const tag = RENAME[raw] ?? raw;
    if (tag === "br") { if (!closing) out += "<br>"; continue; }
    if (tag === "img") {
      const a = attributes(m[3]);
      const src = decodeEntities(a.src ?? "");
      if (!closing && IMAGE_SRC.test(src)) out += `<img src="${src}" alt="${escapeAttr(decodeEntities(a.alt ?? "").slice(0, 200))}" loading="lazy">`;
      continue;
    }
    if (!CONTAINERS.has(tag)) continue;
    if (closing) {
      const at = stack.lastIndexOf(tag);
      if (at < 0) continue;
      while (stack.length > at) out += `</${stack.pop()}>`;
      continue;
    }
    if (tag === "a") {
      if (stack.includes("a")) continue;
      const href = safeHref(attributes(m[3]).href ?? "");
      if (!href) continue;
      out += `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer nofollow">`;
    } else out += `<${tag}>`;
    stack.push(tag);
  }
  text(html.slice(last));
  while (stack.length) out += `</${stack.pop()}>`;
  return out.replace(/<p><\/p>/g, "").trim();
}

function plainToHtml(text: string) {
  return text.trim().split(/\n{2,}/).map(p => `<p>${escapeAttr(p).replace(/\n/g, "<br>")}</p>`).join("");
}
/** Safe HTML for display: rich articles are sanitized, legacy plain text is escaped. */
export function knowledgeToHtml(content: string) {
  return isRichKnowledge(content) ? sanitizeKnowledgeHtml(content) : plainToHtml(content);
}
/** Plain text for AI prompts, guardrails and length checks. */
export function knowledgeToText(content: string) {
  if (!isRichKnowledge(content)) return content;
  const html = sanitizeKnowledgeHtml(content)
    .replace(/<img [^>]*alt="([^"]*)"[^>]*>/g, (_, alt: string) => alt ? `[image: ${alt}]` : "[image]")
    .replace(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_, href: string, label: string) => {
      const plain = label.replace(/<[^>]*>/g, "");
      return decodeEntities(plain).trim() === decodeEntities(href) ? label : `${label} (${href})`;
    })
    .replace(/<br>/g, "\n").replace(/<li>/g, "- ").replace(/<\/(?:p|li|ul|ol)>/g, "\n");
  return decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
/** Normalizes editor output before storage. Plain text is kept verbatim. */
export function normalizeKnowledgeContent(content: string) {
  return isRichKnowledge(content) ? sanitizeKnowledgeHtml(content) : content.trim();
}
