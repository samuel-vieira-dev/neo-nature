"use client";
import { useEffect, useRef, useState } from "react";
import { Bold, ImagePlus, Italic, Link2, Unlink } from "lucide-react";
import { KNOWLEDGE_IMAGE_MAX_BYTES, KNOWLEDGE_IMAGE_TYPES, knowledgeToHtml, sanitizeKnowledgeHtml } from "@/lib/knowledge";

const tool = "flex h-9 min-w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-white px-2 text-sm disabled:opacity-50";
const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Uncontrolled contentEditable editor. Remount (key) to load new content; the server re-sanitizes on save. */
export default function RichTextEditor({ initial, disabled, onChange, className }: { initial: string; disabled: boolean; onChange: (html: string) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const range = useRef<Range | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef(initial);
  // Load once; later `initial` updates echo our own edits and must not reset the caret.
  useEffect(() => { if (ref.current) ref.current.innerHTML = first.current ? knowledgeToHtml(first.current) : ""; }, []);

  const emit = () => { if (ref.current) onChange(ref.current.innerHTML); };
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel?.rangeCount && ref.current?.contains(sel.anchorNode)) range.current = sel.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    ref.current?.focus();
    const sel = window.getSelection();
    if (range.current && sel) { sel.removeAllRanges(); sel.addRange(range.current); }
  };
  const exec = (command: string, value?: string) => { restoreSelection(); document.execCommand(command, false, value); saveSelection(); emit(); };
  const insertHtml = (html: string) => exec("insertHTML", sanitizeKnowledgeHtml(html));

  const link = () => {
    saveSelection();
    const url = window.prompt("Link URL (https://…)")?.trim();
    if (!url) return;
    if (!/^(https?:\/\/|mailto:|\/(?![/\\]))/i.test(url)) { setError("Links must start with https://, http://, mailto: or /"); return; }
    setError(null);
    if (range.current && !range.current.collapsed) exec("createLink", url);
    else insertHtml(`<a href="${escapeAttr(url)}">${escapeAttr(url)}</a>`);
  };
  const upload = async (picked: File) => {
    setError(null);
    if (!(KNOWLEDGE_IMAGE_TYPES as readonly string[]).includes(picked.type)) return setError("Only PNG, JPEG, GIF or WebP images are allowed.");
    if (picked.size > KNOWLEDGE_IMAGE_MAX_BYTES) return setError(`Images must be ${KNOWLEDGE_IMAGE_MAX_BYTES / 1024 / 1024} MB or smaller.`);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", picked);
      const res = await fetch("/api/admin/support/knowledge/images", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? `HTTP ${res.status}`).replaceAll("_", " "));
      const alt = picked.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120);
      insertHtml(`<img src="${escapeAttr(data.url)}" alt="${escapeAttr(alt)}">`);
    } catch (e) {
      setError(`Upload failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally { setUploading(false); if (file.current) file.current.value = ""; }
  };

  return <div className="space-y-2">
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1.5">
      <button type="button" className={tool} disabled={disabled} aria-label="Bold" title="Bold" onMouseDown={e => e.preventDefault()} onClick={() => exec("bold")}><Bold className="h-4 w-4" /></button>
      <button type="button" className={tool} disabled={disabled} aria-label="Italic" title="Italic" onMouseDown={e => e.preventDefault()} onClick={() => exec("italic")}><Italic className="h-4 w-4" /></button>
      <button type="button" className={tool} disabled={disabled} aria-label="Insert link" title="Insert link" onMouseDown={e => e.preventDefault()} onClick={link}><Link2 className="h-4 w-4" /></button>
      <button type="button" className={tool} disabled={disabled} aria-label="Remove link" title="Remove link" onMouseDown={e => e.preventDefault()} onClick={() => exec("unlink")}><Unlink className="h-4 w-4" /></button>
      <button type="button" className={tool} disabled={disabled || uploading} aria-label="Upload image or GIF" title="Upload image or GIF" onMouseDown={e => { e.preventDefault(); saveSelection(); }} onClick={() => file.current?.click()}><ImagePlus className="h-4 w-4" /><span className="ml-1">{uploading ? "Uploading…" : "Image / GIF"}</span></button>
      <input ref={file} type="file" hidden accept={KNOWLEDGE_IMAGE_TYPES.join(",")} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
    </div>
    <div ref={ref} role="textbox" aria-multiline="true" aria-label="Approved content" contentEditable={!disabled} suppressContentEditableWarning
      className={className}
      onInput={emit} onBlur={() => { saveSelection(); emit(); }} onKeyUp={saveSelection} onMouseUp={saveSelection}
      onPaste={e => { const html = e.clipboardData.getData("text/html"); if (!html) return; e.preventDefault(); insertHtml(html); }}
      onDrop={e => e.preventDefault()} />
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </div>;
}
