"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";
import { useCan } from "@/components/AdminProvider";
import NoAccess from "@/components/NoAccess";
import { RefundForm, RefundResponse } from "@/lib/refund/form";

type RequestRow = { id: string; userId: string; email: string; orderNumber: string; createdAt: string; status: string; notes: string; response: RefundResponse; syncStatus: string; freshdeskId: number | null };
const statuses: Record<string,string> = {new:"New",in_review:"In review",awaiting_customer:"Awaiting customer",closed:"Closed"};
const input = "w-full rounded-xl border border-[var(--border)] bg-white p-3 text-sm";
const button = "rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white disabled:opacity-50";
export default function RefundsPage() {
  const canRead = useCan("customers:read");
  const canEdit = useCan("refund-form:write");
  const [tab,setTab] = useState("requests");
  if (!canRead) return <NoAccess />;
  return <div className="mx-auto max-w-5xl" data-clarity-mask="true">
    <h1 className="font-display text-2xl font-bold">Refund forms</h1>
    <p className="mt-1 text-sm text-muted">Review submissions and attachments. Review status does not issue a refund or change the order.</p>
    <div className="my-5 flex gap-3"><button className={tab === "requests" ? button : input+" !w-auto"} onClick={() => setTab("requests")}>Requests</button>{canEdit && <button className={tab === "form" ? button : input+" !w-auto"} onClick={() => setTab("form")}>Edit form</button>}</div>
    {tab === "requests" ? <Requests /> : <FormEditor />}
  </div>;
}
function Requests() {
  const [status,setStatus] = useState(""); const [page,setPage] = useState(0);
  const [selected,setSelected] = useState<RequestRow | null>(null);
  const query = useQuery({ queryKey:["admin-refunds",status,page], queryFn:() => adminApi<{requests:RequestRow[];total:number}>(`/api/admin/refund-requests?status=${encodeURIComponent(status)}&page=${page}`) });
  return <div>
    <label className="mb-4 block max-w-xs text-sm font-semibold">Review status<select value={status} onChange={e => {setStatus(e.target.value);setPage(0);}} className={input}><option value="">All statuses</option>{Object.entries(statuses).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    {query.isPending ? <p role="status">Loading requests…</p> : query.isError ? <div role="alert">Couldn&apos;t load requests. <button onClick={() => query.refetch()} className={button}>Retry</button></div> : <>
      <p className="mb-3 text-sm text-muted">{query.data.total} submissions</p>
      <div className="space-y-3">{query.data.requests.map(r => <button key={r.id} onClick={() => setSelected(r)} className="card flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl p-4 text-left"><span><strong>{r.id} · Order {r.orderNumber}</strong><span className="block text-sm text-muted">{r.email} · {new Date(r.createdAt).toLocaleString()}</span></span><span className="text-sm">{r.response.outcome === "retained" ? "Continued program · " : ""}{statuses[r.status]}</span></button>)}</div>
      {!query.data.requests.length && <p className="card rounded-2xl p-8 text-center text-muted">No submissions found.</p>}
      <div className="mt-4 flex items-center gap-4"><button className={button} disabled={page===0} onClick={() => setPage(p=>p-1)}>Previous</button><span>Page {page+1}</span><button className={button} disabled={(page+1)*25 >= query.data.total} onClick={() => setPage(p=>p+1)}>Next</button></div>
    </>}
    {selected && <RequestDetail key={selected.id} row={selected} close={() => setSelected(null)} />}
  </div>;
}
function RequestDetail({row,close}:{row:RequestRow;close:()=>void}) {
  const canWrite = useCan("tickets:write"); const qc = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const [status,setStatus] = useState(row.status); const [notes,setNotes] = useState(row.notes);
  const mutation = useMutation({ mutationFn:() => adminApi("/api/admin/refund-requests",{method:"PATCH",body:JSON.stringify({id:row.id,status,notes})}), onSuccess:() => {qc.invalidateQueries({queryKey:["admin-refunds"]});close();} });
  return <dialog ref={dialog} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-24px)] max-w-3xl overflow-y-auto rounded-3xl bg-white p-0 text-[var(--text)] backdrop:bg-black/40" aria-label={`Request ${row.id}`} onCancel={e => { e.preventDefault(); if (!mutation.isPending) close(); }}>
    <div className="mx-auto max-w-3xl rounded-3xl bg-white p-5 sm:p-8"><div className="flex justify-between gap-4"><h2 className="text-xl font-bold">{row.id} · Order {row.orderNumber}</h2><button autoFocus onClick={close} disabled={mutation.isPending} className="font-semibold">Close</button></div>
      <p className="mt-2 text-sm text-muted">Form version {row.response.version} · Freshdesk: {row.syncStatus}{row.freshdeskId ? ` (#${row.freshdeskId})` : ""}</p>
      <div className="my-6 space-y-5">{row.response.form.pages.flatMap(p => p.blocks).filter(b => b.type !== "copy" && row.response.answers[b.id]).map(b => <div key={b.id}><h3 className="whitespace-pre-line text-sm font-bold">{b.label}</h3>{b.type === "file" ? <a className="mt-1 inline-block font-semibold text-[var(--accent)] underline" href={`/api/admin/refund-requests/${encodeURIComponent(row.id)}/attachments/${encodeURIComponent(row.response.answers[b.id])}`}>Download {b.accept === "video" ? "video" : "photo"}</a> : <p className="mt-1 whitespace-pre-wrap break-words rounded-xl bg-[var(--surface)] p-3 text-sm">{b.options?.find(o => o.id === row.response.answers[b.id])?.label ?? row.response.answers[b.id]}</p>}</div>)}</div>
      {canWrite && <form onSubmit={e => {e.preventDefault();mutation.mutate();}} className="space-y-4"><label className="block text-sm font-semibold">Review status<select value={status} onChange={e=>setStatus(e.target.value)} className={input}>{Object.entries(statuses).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="block text-sm font-semibold">Internal notes<textarea className={input} rows={5} maxLength={8000} value={notes} onChange={e=>setNotes(e.target.value)} /></label>{mutation.isError && <p role="alert" className="text-rose-700">{mutation.error.message}</p>}<button className={button} disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save review"}</button></form>}
    </div>
  </dialog>;
}
function FormEditor() {
  const query = useQuery({queryKey:["admin-refund-form"],queryFn:()=>adminApi<{version:number;form:RefundForm}>("/api/admin/refund-form")});
  if(query.isPending) return <p>Loading form…</p>;
  if(query.isError) return <p role="alert">Couldn&apos;t load the form. <button onClick={()=>query.refetch()}>Retry</button></p>;
  return <Editor key={query.data.version} initial={query.data} />;
}
function Editor({initial}:{initial:{version:number;form:RefundForm}}) {
  const [draft,setDraft] = useState(()=>structuredClone(initial.form));
  const [selected,setSelected] = useState(0); const [saved,setSaved] = useState(false);
  const [version,setVersion] = useState(initial.version);
  const qc = useQueryClient();
  function edit(fn:(form:RefundForm)=>void) {setDraft(old=>{const next=structuredClone(old);fn(next);return next;});setSaved(false);}
  const mutation = useMutation({mutationFn:()=>adminApi<{version:number;form:RefundForm}>("/api/admin/refund-form",{method:"PUT",body:JSON.stringify({version,form:draft})}),onSuccess:data=>{setVersion(data.version);setSaved(true);qc.invalidateQueries({queryKey:["refund-form"]});}});
  const page = draft.pages[selected];
  const pageLabel = (i:number) => `${i+1}. ${draft.pages[i].blocks[0]?.label.slice(0,85) || "Thank you"}`;
  return <div className="space-y-5">
    <p className="rounded-xl bg-[var(--accent-soft)] p-4 text-sm">Edit copy, questions, choices, required fields and conditional destinations. Saving publishes a new version for new sessions; existing submissions and forms already being filled out keep their original version.</p>
    <fieldset disabled={mutation.isPending} className="space-y-5">
      <label className="block text-sm font-semibold">Form title<input className={input} value={draft.title} maxLength={200} onChange={e=>edit(f=>{f.title=e.target.value;})}/></label>
      <label className="block text-sm font-semibold">Page<select className={input} value={selected} onChange={e=>setSelected(Number(e.target.value))}>{draft.pages.map((p,i)=><option key={p.id} value={i}>{pageLabel(i)}</option>)}</select></label>
      {page.blocks.map((b,i)=><div key={b.id} className="card space-y-3 rounded-2xl p-4"><label className="block text-sm font-semibold">{b.type === "copy" ? "Page text" : `Question · ${b.type}`}<textarea rows={b.type === "copy" ? 5 : 2} className={input} value={b.label} onChange={e=>edit(f=>{f.pages[selected].blocks[i].label=e.target.value;})} /></label>
        {b.type !== "copy" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!b.required} onChange={e=>edit(f=>{f.pages[selected].blocks[i].required=e.target.checked;})}/>Required</label>}
        {b.options?.map((o,j)=><label key={o.id} className="block text-sm">Option {j+1}<input className={input} value={o.label} onChange={e=>edit(f=>{f.pages[selected].blocks[i].options![j].label=e.target.value;})}/></label>)}
        {b.minLength !== undefined && <label className="block text-sm">Minimum characters<input type="number" min={0} max={4000} className={input} value={b.minLength} onChange={e=>edit(f=>{f.pages[selected].blocks[i].minLength=Number(e.target.value);})}/></label>}
        {b.type === "file" && <p className="text-sm text-muted">{b.accept} upload · up to {b.maxMB} MB</p>}
      </div>)}
      {!!page.rules.length && <div className="card space-y-4 rounded-2xl p-4"><h3 className="font-bold">Conditional navigation</h3>{page.rules.map((r,i)=><div key={i} className="space-y-2 border-t border-[var(--border)] pt-3"><p className="text-sm">When {r.conditions.map(c=>draft.pages.flatMap(p=>p.blocks).find(b=>b.id===c.field)?.options?.find(o=>o.id===c.value)?.label).join(r.operator === "AND" ? " and " : " or ")}</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.stop} onChange={e=>edit(f=>{f.pages[selected].rules[i].stop=e.target.checked;})}/>End here without submission</label><label className="block text-sm">Next page<select className={input} disabled={r.stop} value={r.target ?? ""} onChange={e=>edit(f=>{f.pages[selected].rules[i].target=e.target.value || null;})}><option value="">Following page</option>{draft.pages.map((p,j)=><option key={p.id} value={p.id}>{pageLabel(j)}</option>)}</select></label></div>)}</div>}
    </fieldset>
    {mutation.isError && <p role="alert" className="text-rose-700">{mutation.error.message}</p>}
    {saved && <p role="status" className="text-[var(--accent)]">Version {version} published.</p>}
    <button className={button} disabled={mutation.isPending} onClick={()=>mutation.mutate()}>{mutation.isPending ? "Saving…" : "Save and publish version"}</button>
  </div>;
}
