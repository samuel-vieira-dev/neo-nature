"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImagePlus, Monitor, Plus, Smartphone, Trash2, X } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { useAdmin, useCan } from "@/components/AdminProvider";
import NoAccess from "@/components/NoAccess";
import RichTextEditor from "@/components/admin/RichTextEditor";
import EbookReader from "@/components/EbookReader";
import { CONTENT_CATEGORIES, EBOOK_CONTENT_MAX, EBOOK_MAX_CHAPTERS, EBOOK_STATUS_LABELS, EBOOK_SUMMARY_MAX, type EbookAction, type EbookChapter, type EbookSnapshot, type EbookStatus } from "@/lib/content";
import { KNOWLEDGE_IMAGE_MAX_BYTES, KNOWLEDGE_IMAGE_TYPES, RICH_TEXT, knowledgeImagePath, knowledgeToHtml, knowledgeToText } from "@/lib/knowledge";

type Person = { name: string; email: string } | null;
type Ebook = EbookSnapshot & { id: string; status: EbookStatus; published: EbookSnapshot | null; publishedAt: string | null; version: number; createdBy: string | null; createdAt: string; updatedAt: string; createdByAdmin: Person; updatedByAdmin: Person };
type Revision = { version: number; snapshot: EbookSnapshot; status: EbookStatus; action: EbookAction; createdAt: string; admin: Person };

const control = "rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm disabled:opacity-50";
const primary = "rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const STATUS_TONE: Record<EbookStatus, string> = { draft: "bg-slate-100 text-slate-700", in_review: "bg-amber-50 text-amber-800", published: "bg-emerald-50 text-emerald-800" };
const ACTION_LABELS: Record<EbookAction, string> = { save: "Saved draft", submit: "Sent to review", publish: "Published", unpublish: "Unpublished" };
const who = (p: Person) => (p ? (p.name ? `${p.name} (${p.email})` : p.email) : "Unknown");
const when = (iso: string) => new Date(iso).toLocaleString();
const newChapter = (): EbookChapter => ({ id: crypto.randomUUID(), title: "", content: "" });

function StatusChip({ status }: { status: EbookStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[status]}`}>{EBOOK_STATUS_LABELS[status]}</span>;
}

export default function ContentPage() {
  const canWrite = useCan("content:write");
  const cache = useQueryClient();
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: ["content-ebooks"], queryFn: () => adminApi<{ ebooks: Ebook[] }>("/api/admin/content/ebooks"), enabled: canWrite, refetchOnWindowFocus: false });
  if (!canWrite) return <NoAccess />;
  const all = query.data?.ebooks ?? [];
  const ebook = all.find((e) => e.id === selected);

  if (selected) {
    return <EbookEditor key={ebook ? `${ebook.id}:${ebook.version}` : "new"} ebook={ebook} back={() => setSelected(null)}
      saved={(e) => { cache.setQueryData<{ ebooks: Ebook[] }>(["content-ebooks"], (old) => ({ ebooks: [e, ...(old?.ebooks ?? []).filter((x) => x.id !== e.id)] })); setSelected(e.id); }} />;
  }

  const needle = search.trim().toLowerCase();
  const visible = all.filter((e) => !needle || e.title.toLowerCase().includes(needle));
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">E-books</h1><p className="mt-1 text-sm text-muted">Published e-books appear in the webapp under Learn. Edits to a live e-book stay private until it is published again.</p></div>
      <button className={`${control} flex items-center gap-1 font-semibold`} onClick={() => setSelected("new")}><Plus className="h-4 w-4" /> New e-book</button>
    </div>
    <input type="search" aria-label="Search by title" placeholder="Search by title…" className={`${control} w-full max-w-sm`} value={search} onChange={(e) => setSearch(e.target.value)} />
    {query.error && <p role="alert" className="text-rose-700">Could not load e-books. <button className="underline" onClick={() => query.refetch()}>Retry</button></p>}
    {query.isLoading ? <p>Loading…</p> : visible.length === 0 ? <p className="text-sm text-muted">{all.length ? "No e-books match." : "No e-books yet. Create the first one."}</p> : (
      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Live</th><th className="px-4 py-3">Last updated</th></tr></thead>
          <tbody>{visible.map((e) => <tr key={e.id} className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]" onClick={() => setSelected(e.id)}>
            <td className="px-4 py-3"><button className="text-left font-semibold">{e.title}</button><span className="block text-xs text-muted">{e.chapters.length} {e.chapters.length === 1 ? "chapter" : "chapters"}</span></td>
            <td className="px-4 py-3">{e.category}</td>
            <td className="px-4 py-3"><StatusChip status={e.status} /></td>
            <td className="px-4 py-3">{e.published ? "Yes" : "No"}</td>
            <td className="px-4 py-3 text-xs text-muted">{when(e.updatedAt)}<span className="block">by {who(e.updatedByAdmin)}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    )}
  </div>;
}

function EbookEditor({ ebook, back, saved }: { ebook?: Ebook; back: () => void; saved: (e: Ebook) => void }) {
  const admin = useAdmin();
  const [title, setTitle] = useState(ebook?.title ?? "");
  const [summary, setSummary] = useState(ebook?.summary ?? "");
  const [category, setCategory] = useState(ebook?.category ?? "");
  const [coverImageId, setCover] = useState<string | null>(ebook?.coverImageId ?? null);
  const [chapters, setChapters] = useState<EbookChapter[]>(ebook?.chapters.length ? ebook.chapters : [newChapter()]);
  const [active, setActive] = useState(0);
  const [editorKey, setEditorKey] = useState(0);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [previewChapter, setPreviewChapter] = useState<number | null>(null);
  const [showHistory, setHistory] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const snapshot: EbookSnapshot = { title, summary, category, coverImageId, chapters };
  const initial = useMemo(() => JSON.stringify(ebook ? { title: ebook.title, summary: ebook.summary, category: ebook.category, coverImageId: ebook.coverImageId, chapters: ebook.chapters } : null), [ebook]);
  const dirty = ebook ? JSON.stringify(snapshot) !== initial : !!(title || summary || category || coverImageId || chapters.some((c) => c.title || c.content));
  const mutation = useMutation({ mutationFn: (action: EbookAction) => adminApi<Ebook>("/api/admin/content/ebooks", { method: "POST", body: JSON.stringify({ id: ebook?.id, ...snapshot, version: ebook?.version ?? 0, action }) }), onSuccess: saved });
  const history = useQuery({ queryKey: ["content-ebook-history", ebook?.id], queryFn: () => adminApi<{ revisions: Revision[] }>(`/api/admin/content/ebooks?history=${encodeURIComponent(ebook!.id)}`), enabled: showHistory && !!ebook });

  const canPublish = admin.role === "admin" || !ebook || ebook.createdBy === admin.id;
  const length = chapters.reduce((n, c) => n + c.content.length, 0);
  const base = title.trim().length >= 3 && CONTENT_CATEGORIES.includes(category) && summary.length <= EBOOK_SUMMARY_MAX && length <= EBOOK_CONTENT_MAX;
  const complete = base && chapters.every((c) => c.title.trim() && (knowledgeToText(c.content).trim() || c.content.includes("<img")));
  const busy = mutation.isPending;
  const chapter = chapters[Math.min(active, chapters.length - 1)];

  const updateChapter = (patch: Partial<EbookChapter>) => setChapters((list) => list.map((c, i) => (i === active ? { ...c, ...patch } : c)));
  const addChapter = () => { setChapters((list) => [...list, newChapter()]); setActive(chapters.length); setPreviewChapter(chapters.length); };
  const removeChapter = () => {
    if (chapters.length <= 1 || !window.confirm(`Remove "${chapter.title || `Chapter ${active + 1}`}"? This only takes effect when you save.`)) return;
    setChapters((list) => list.filter((_, i) => i !== active));
    setActive((i) => Math.max(0, i - 1));
    setPreviewChapter(null);
  };
  const restore = (r: Revision) => { setTitle(r.snapshot.title); setSummary(r.snapshot.summary); setCategory(r.snapshot.category); setCover(r.snapshot.coverImageId); setChapters(r.snapshot.chapters.length ? r.snapshot.chapters : [newChapter()]); setActive(0); setPreviewChapter(0); setEditorKey((k) => k + 1); };
  const uploadCover = async (file: File) => {
    setCoverError(null);
    if (!(KNOWLEDGE_IMAGE_TYPES as readonly string[]).includes(file.type)) return setCoverError("Use a PNG, JPEG, GIF or WebP image.");
    if (file.size > KNOWLEDGE_IMAGE_MAX_BYTES) return setCoverError("Images must be 5 MB or smaller.");
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/content/images", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? `HTTP ${res.status}`).replaceAll("_", " "));
      setCover(data.id);
    } catch (e) { setCoverError(`Upload failed: ${e instanceof Error ? e.message : "unknown error"}`); }
    finally { setUploading(false); }
  };

  // The preview runs the same sanitizer as the server, so it matches what customers will see.
  const preview = { id: ebook?.id ?? "preview", title, summary, category: category || "Category", coverUrl: coverImageId ? knowledgeImagePath(coverImageId) : null, chapters: chapters.map((c) => ({ id: c.id, title: c.title, html: knowledgeToHtml(c.content) })) };
  const previewAt = previewChapter ?? active;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <button className="flex items-center gap-1 text-sm text-[var(--accent)] underline" onClick={() => { if (!dirty || window.confirm("Discard unsaved changes?")) back(); }}><ArrowLeft className="h-4 w-4" /> All e-books</button>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-bold">{ebook ? "Edit e-book" : "New e-book"}{ebook && <StatusChip status={ebook.status} />}{ebook?.published && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">Live</span>}</h1>
        {ebook && <p className="mt-1 text-xs text-muted">Created {when(ebook.createdAt)} by {who(ebook.createdByAdmin)} · Last updated {when(ebook.updatedAt)} by {who(ebook.updatedByAdmin)} · v{ebook.version}{ebook.publishedAt && ebook.published ? ` · Live since ${when(ebook.publishedAt)}` : ""}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={control} disabled={busy || !base} onClick={() => mutation.mutate("save")}>Save draft</button>
        <button className={control} disabled={busy || !complete} onClick={() => mutation.mutate("submit")}>Send to review</button>
        {canPublish && <button className={primary} disabled={busy || !complete} onClick={() => mutation.mutate("publish")}>Publish</button>}
        {canPublish && ebook?.published && <button className={control} disabled={busy || !base} onClick={() => { if (window.confirm("Take this e-book off the webapp?")) mutation.mutate("unpublish"); }}>Unpublish</button>}
      </div>
    </div>
    {dirty && ebook && <p className="text-sm text-amber-700">Unsaved changes.</p>}
    {!canPublish && <p className="text-sm text-muted">Only the author or an admin can publish this e-book. Send it to review when it is ready.</p>}
    {mutation.error && <p role="alert" className="text-sm text-rose-700">{mutation.error.message.replaceAll("_", " ")}. Copy your changes before reloading.</p>}

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5">
        <label className="block text-sm">Title<input className={`${control} mt-1 w-full`} maxLength={200} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block text-sm">Category<select className={`${control} mt-1 w-full`} value={category} disabled={busy} onChange={(e) => setCategory(e.target.value)}>{!category && <option value="" disabled>Choose a category…</option>}{CONTENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="block text-sm">Short description <span className="text-xs text-muted">(shown in the Learn list)</span><textarea className={`${control} mt-1 w-full`} rows={2} maxLength={EBOOK_SUMMARY_MAX} value={summary} disabled={busy} onChange={(e) => setSummary(e.target.value)} /></label>
        <div className="text-sm">
          <span>Cover <span className="text-xs text-muted">(optional, portrait works best)</span></span>
          <div className="mt-1 flex items-center gap-3">
            {coverImageId
              // eslint-disable-next-line @next/next/no-img-element -- our own image route
              ? <img src={knowledgeImagePath(coverImageId)} alt="Cover" className="h-24 w-[4.5rem] rounded-xl border border-[var(--border)] object-cover" />
              : <div className="flex h-24 w-[4.5rem] items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-xs text-muted">No cover</div>}
            <label className={`${control} flex cursor-pointer items-center gap-1`}><ImagePlus className="h-4 w-4" />{uploading ? "Uploading…" : coverImageId ? "Replace" : "Upload"}<input type="file" hidden accept={KNOWLEDGE_IMAGE_TYPES.join(",")} disabled={busy || uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadCover(f); e.target.value = ""; }} /></label>
            {coverImageId && <button className={`${control} flex items-center gap-1`} disabled={busy} onClick={() => setCover(null)}><X className="h-4 w-4" /> Remove</button>}
          </div>
          {coverError && <p role="alert" className="mt-1 text-rose-700">{coverError}</p>}
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Chapters</h2><span className="text-xs text-muted">{length.toLocaleString()}/{EBOOK_CONTENT_MAX.toLocaleString()} characters in total</span></div>
          <div role="tablist" aria-label="Chapters" className="mt-2 flex flex-wrap gap-1.5">
            {chapters.map((c, i) => <button key={c.id} role="tab" aria-selected={i === active} className={`rounded-xl border px-3 py-1.5 text-sm ${i === active ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent)]" : "border-[var(--border)]"}`} onClick={() => { setActive(i); setPreviewChapter(i); }}>{i + 1}. {c.title.trim() || "Untitled"}</button>)}
            <button className={`${control} flex items-center gap-1`} disabled={busy || chapters.length >= EBOOK_MAX_CHAPTERS} onClick={addChapter}><Plus className="h-4 w-4" /> Add chapter</button>
          </div>
          <div className="mt-3 space-y-3">
            <div className="flex items-end gap-2">
              <label className="block flex-1 text-sm">Chapter {active + 1} title<input className={`${control} mt-1 w-full`} maxLength={160} value={chapter.title} disabled={busy} onChange={(e) => updateChapter({ title: e.target.value })} /></label>
              <button className={`${control} flex items-center gap-1`} disabled={busy || chapters.length <= 1} onClick={removeChapter} aria-label="Remove chapter"><Trash2 className="h-4 w-4" /></button>
            </div>
            <RichTextEditor key={`${chapter.id}:${editorKey}`} initial={chapter.content} disabled={busy} label={`Chapter ${active + 1} content`} uploadUrl="/api/admin/content/images" onChange={(html) => updateChapter({ content: html })} className={`${control} ${RICH_TEXT} min-h-80 w-full overflow-y-auto text-base leading-7 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]`} />
          </div>
        </div>

        {ebook && <div className="border-t border-[var(--border)] pt-4">
          <button className={control} onClick={() => setHistory((v) => !v)}>{showHistory ? "Hide" : "Show"} edit history</button>
          {showHistory && <div className="mt-3 space-y-2">{history.isLoading ? <p className="text-sm">Loading…</p> : history.error ? <p role="alert" className="text-sm text-rose-700">Could not load history.</p> : history.data?.revisions.map((r) => <div key={r.version} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3 text-sm">
            <div><p><strong>v{r.version}</strong> · {ACTION_LABELS[r.action] ?? r.action}</p><p className="text-xs text-muted">{when(r.createdAt)} · {who(r.admin)} · “{r.snapshot.title}”, {r.snapshot.chapters.length} {r.snapshot.chapters.length === 1 ? "chapter" : "chapters"}</p></div>
            <button className={control} disabled={busy} onClick={() => restore(r)}>Restore into editor</button>
          </div>)}</div>}
        </div>}
      </section>

      <aside className="space-y-3 self-start lg:sticky lg:top-20">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Live preview</h2>
          <div role="group" aria-label="Device" className="flex gap-1">
            <button aria-pressed={device === "mobile"} className={`${control} flex items-center gap-1 ${device === "mobile" ? "border-[var(--accent)] text-[var(--accent)]" : ""}`} onClick={() => setDevice("mobile")}><Smartphone className="h-4 w-4" /> Mobile</button>
            <button aria-pressed={device === "desktop"} className={`${control} flex items-center gap-1 ${device === "desktop" ? "border-[var(--accent)] text-[var(--accent)]" : ""}`} onClick={() => setDevice("desktop")}><Monitor className="h-4 w-4" /> Desktop</button>
          </div>
        </div>
        {device === "mobile" ? (
          <div className="mx-auto h-[700px] w-[375px] max-w-full overflow-y-auto rounded-[2rem] border-[6px] border-slate-800 bg-[var(--bg)] pt-4">
            <EbookReader ebook={preview} chapter={previewAt} onChapter={setPreviewChapter} />
          </div>
        ) : (
          // A 1280×800 screen at 30%: the webapp keeps its phone-width column centred on desktop.
          <div className="h-[240px] w-[384px] max-w-full overflow-hidden rounded-xl border-4 border-slate-800 bg-[var(--surface)]">
            <div className="h-[800px] w-[1280px] origin-top-left scale-[0.3] overflow-y-auto">
              <div className="mx-auto min-h-full w-full max-w-md bg-[var(--bg)] pt-6"><EbookReader ebook={preview} chapter={previewAt} onChapter={setPreviewChapter} /></div>
            </div>
          </div>
        )}
        <p className="text-xs text-muted">Shows unsaved edits exactly as customers will read them. Dark mode preview arrives with the app-wide dark theme.</p>
      </aside>
    </div>
  </div>;
}
