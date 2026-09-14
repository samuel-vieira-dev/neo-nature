"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { Answers, RefundForm as Definition, ORDER_FIELD, fieldError, nextPage, RefundBlock } from "@/lib/refund/form";

type Config = { version: number; form: Definition; defaults: Answers; lockedFields?: string[] };
const inputClass = "card w-full rounded-2xl p-4 text-base focus:outline-2 focus:outline-[var(--accent)]";
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}
export default function RefundForm({ orderNumber, onBack, standalone = false }: { orderNumber: string | null; onBack?: () => void; standalone?: boolean }) {
  const query = useQuery({ queryKey: ["refund-form", standalone ? "email" : "app"], queryFn: () => json<Config>("/api/refund-form", standalone ? { headers: { "X-Refund-Access": "email" } } : undefined), staleTime: Infinity });
  if (query.isPending) return <p role="status" className="py-8 text-center">Loading refund form…</p>;
  if (query.isError) return <div role="alert"><p>We couldn&apos;t load the refund form.</p><button onClick={() => query.refetch()} className={inputClass}>Try again</button><button onClick={onBack}>Back</button></div>;
  return <FormSession config={query.data} orderNumber={orderNumber} onBack={onBack} standalone={standalone} />;
}
function FormSession({ config: initialConfig, orderNumber, onBack, standalone }: { config: Config; orderNumber: string | null; onBack?: () => void; standalone: boolean }) {
  const [config] = useState(initialConfig);
  const [answers, setAnswers] = useState<Answers>({ ...config.defaults, ...(orderNumber && orderNumber !== "Not order-related" ? { [ORDER_FIELD]: orderNumber } : {}) });
  const [history, setHistory] = useState([config.form.pages[0].id]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [fileNames, setFileNames] = useState<Record<string,string>>({});
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saving");
  const requestId = useRef(crypto.randomUUID());
  const started = useRef(false);
  const autosaveReady = useRef(false);
  const lock = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const qc = useQueryClient();
  const page = config.form.pages.find(p => p.id === history.at(-1))!;
  const getId = () => requestId.current;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void fetch("/api/refund-form/draft", { method: "POST", headers: { "Content-Type": "application/json", ...(standalone ? { "X-Refund-Access": "email" } : {}) }, keepalive: true,
      body: JSON.stringify({ requestId: getId(), version: config.version, currentPageId: page.id, answers }),
    }).then(res => { if (!res.ok) throw new Error(); setSaveState("saved"); }).catch(() => setSaveState("error"));
  }, [answers, config.version, page.id, standalone]);
  useEffect(() => {
    if (!autosaveReady.current) { autosaveReady.current = true; return; }
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      void fetch("/api/refund-form/draft", { method: "POST", headers: { "Content-Type": "application/json", ...(standalone ? { "X-Refund-Access": "email" } : {}) }, keepalive: true,
        body: JSON.stringify({ requestId: getId(), version: config.version, currentPageId: page.id, answers }),
      }).then(res => { if (!res.ok) throw new Error(); setSaveState("saved"); }).catch(() => setSaveState("error"));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [answers, config.version, page.id, standalone]);
  const update = (id: string, value: string) => { setAnswers(a => ({ ...a, [id]: value })); setErrors(e => ({ ...e, [id]: "" })); setError(""); };
  const advance = (id: string) => { setHistory(h => [...h, id]); setErrors({}); setError(""); requestAnimationFrame(() => { title.current?.focus(); title.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }); };
  async function upload(block: RefundBlock, file?: File) {
    if (!file || lock.current) return;
    if (file.size > (block.maxMB ?? 20) * 1024 * 1024 || !file.type.startsWith(`${block.accept}/`)) { setErrors(e => ({ ...e, [block.id]: `Please choose a ${block.accept} file up to ${block.maxMB ?? 20} MB.` })); return; }
    lock.current = true; setUploading(block.id); setError("");
    try {
      const body = new FormData(); body.set("file", file); body.set("requestId", getId()); body.set("fieldId", block.id); body.set("version", String(config.version));
      const result = await json<{id:string;name:string}>("/api/refund-form/uploads", { method: "POST", headers: standalone ? { "X-Refund-Access": "email" } : undefined, body });
      update(block.id, result.id); setFileNames(n => ({ ...n, [block.id]: result.name }));
    } catch (e) { setErrors(v => ({ ...v, [block.id]: e instanceof Error ? e.message : "Upload failed. Please try again." })); }
    finally { lock.current = false; setUploading(null); }
  }
  async function proceed(e: React.FormEvent) {
    e.preventDefault(); if (lock.current || ticketId) return;
    const failures: Record<string,string> = {};
    for (const b of page.blocks) { const message = fieldError(b, answers[b.id]); if (message) failures[b.id] = message; }
    setErrors(failures);
    if (Object.keys(failures).length) { document.getElementById(Object.keys(failures)[0])?.focus(); return; }
    const next = nextPage(config.form, page.id, answers);
    if (!next) return;
    if (!config.form.pages.find(p => p.id === next)?.thankYou) { advance(next); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const res = await json<{ticket:{id:string};endPage:string}>("/api/refund-form", { method: "POST", headers: {"Content-Type":"application/json", ...(standalone ? { "X-Refund-Access": "email" } : {})}, body: JSON.stringify({ version: config.version, clientRequestId: getId(), answers }) });
      setTicketId(res.ticket.id); advance(res.endPage); qc.invalidateQueries({queryKey:["tickets"]});
    } catch (e) { setError(e instanceof Error ? e.message : "We couldn't submit your request. Please try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  const next = nextPage(config.form, page.id, answers);
  const willSubmit = config.form.pages.find(p => p.id === next)?.thankYou;
  return <div className="pb-8" data-clarity-mask="true">
    <h2 ref={title} tabIndex={-1} className="font-display text-xl font-bold outline-none">{config.form.title}</h2>
    <p className="mt-2 flex items-center gap-2 text-sm text-muted"><ShieldCheck className="h-4 w-4" />{ticketId ? `Reference: ${ticketId}` : `Step ${history.length} · Your information is secure · ${saveState === "saving" ? "Saving progress…" : saveState === "saved" ? "Progress saved" : "Progress will retry when you continue"}`}</p>
    <form onSubmit={proceed} noValidate className="mt-5 space-y-5">
      <fieldset disabled={busy || !!uploading || !!ticketId} className="space-y-5 disabled:opacity-70">
        {page.blocks.map(b => b.type === "copy" ? <p key={b.id} className="whitespace-pre-line text-base leading-relaxed">{b.label}</p> : <div key={b.id}>
          <label htmlFor={b.id} className={page.blocks.some(copy => copy.type === "copy" && copy.label === b.label) ? "sr-only" : "mb-2 block text-sm font-semibold"}>{b.label}{b.required ? " *" : " (optional)"}</label>
          {b.type === "choice" || b.type === "checkbox" ? <div id={b.id} tabIndex={-1} role="group" aria-label={b.label} className="space-y-2">
            {b.options?.map(o => <label key={o.id} className={`${inputClass} flex items-start gap-3 ${answers[b.id] === o.id ? "ring-2 ring-[var(--accent)]" : ""}`}><input type={b.type === "checkbox" ? "checkbox" : "radio"} name={b.id} checked={answers[b.id] === o.id} onChange={e => update(b.id, e.target.checked ? o.id : "")} className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]" aria-describedby={errors[b.id] ? `${b.id}-error` : undefined} /><span>{o.label}</span></label>)}
          </div> : b.type === "textarea" ? <textarea id={b.id} value={answers[b.id] ?? ""} onChange={e => update(b.id,e.target.value)} rows={5} maxLength={4000} className={inputClass} aria-invalid={!!errors[b.id]} aria-describedby={errors[b.id] ? `${b.id}-error` : undefined} /> : b.type === "file" ? <>
            <input id={b.id} type="file" accept={b.accept === "image" ? "image/jpeg,image/png,image/webp,image/heic,image/heif" : "video/mp4,video/quicktime,video/webm"} onChange={e => { void upload(b,e.target.files?.[0]); e.target.value = ""; }} className={inputClass} aria-describedby={`${b.id}-help`} />
            <p id={`${b.id}-help`} className="mt-1 text-sm text-muted">{uploading === b.id ? "Uploading…" : fileNames[b.id] ? `Uploaded: ${fileNames[b.id]}` : `${b.accept === "image" ? "JPG, PNG, WebP or HEIC" : "MP4, MOV or WebM"} · Maximum ${b.maxMB ?? 20} MB`}</p>
          </> : <input id={b.id} type={b.type} value={answers[b.id] ?? ""} readOnly={config.lockedFields?.includes(b.id)} maxLength={1000} max={b.noFuture ? new Date().toISOString().slice(0,10) : undefined} onChange={e => update(b.id,e.target.value)} className={inputClass} aria-invalid={!!errors[b.id]} aria-describedby={errors[b.id] ? `${b.id}-error` : undefined} autoComplete={b.type === "email" ? "email" : b.type === "tel" ? "tel" : "off"} />}
          {errors[b.id] && <p id={`${b.id}-error`} role="alert" className="mt-2 text-sm text-rose-700">{errors[b.id]}</p>}
        </div>)}
      </fieldset>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p>}
      {!ticketId && next && <button type="submit" disabled={busy || !!uploading} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] p-4 font-bold text-white disabled:opacity-60">{busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Submitting…</> : willSubmit ? "Submit" : "Next"}</button>}
      {!ticketId && !next && <div className="card rounded-2xl p-4"><p className="text-sm text-muted">Your refund inquiry and the information provided have been recorded for our team. Contact support if you need help.</p><a href="tel:+18772864137" className="mt-2 block font-bold text-[var(--accent)]">Call support · +1 877 286 4137</a></div>}
      {!ticketId && (history.length > 1 || onBack) && <button type="button" disabled={busy || !!uploading} onClick={() => { setErrors({}); setError(""); if(history.length > 1) setHistory(h => h.slice(0,-1)); else onBack?.(); }} className="flex min-h-12 items-center gap-2 font-semibold text-muted"><ArrowLeft className="h-4 w-4" /> Back</button>}
      {ticketId && (standalone ? <p className="rounded-2xl bg-[var(--accent-soft)] p-4 text-center font-bold text-[var(--accent)]">Your request has been received. Save reference {ticketId}.</p> : <Link href="/support" className="block rounded-2xl bg-[var(--accent)] p-4 text-center font-bold text-white">View my tickets</Link>)}
    </form>
  </div>;
}
