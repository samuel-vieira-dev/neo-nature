"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminApi";
import { useCan } from "@/components/AdminProvider";
import type { supportEmailReadiness } from "@/server/support-email";

type Readiness = ReturnType<typeof supportEmailReadiness>;
type Conversation = { id: string; email: string; name: string; subject: string; tier: string; owner: string; status: string; language: string; updatedAt: string; createdAt: string; escalationReason: string | null; freshdeskId: number | null };
type Page = { conversations: Conversation[]; total: number; offset: number; limit: number; hasMore: boolean; config: Readiness };
type Job = { id: string; stage: string; status: string; sendAfter: string; error: string | null; draft: { reply: string; reason: string; intent: string } | null };
type Details = { conversation: Conversation; messages: { id: string; direction: string; text: string; receivedAt: string; attachments: { id: string; name: string }[] }[]; jobs: Job[]; config: Readiness; canDeliver: boolean };
const date = (value: string) => new Date(value).toLocaleString();
const control = "rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm";

export default function SupportEmailPanel() {
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [owner, setOwner] = useState("");
  const [orderBy, setOrderBy] = useState("updated");
  const [direction, setDirection] = useState("desc");
  const query = useInfiniteQuery({
    queryKey: ["support-email", search, tier, owner, orderBy, direction],
    initialPageParam: { offset: 0, limit: 10 },
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ offset: String(pageParam.offset), limit: String(pageParam.limit), orderBy, direction });
      if (search) params.set("q", search);
      if (tier) params.set("tier", tier);
      if (owner) params.set("owner", owner);
      return adminApi<Page>(`/api/admin/support/email?${params}`);
    },
    getNextPageParam: page => page.hasMore ? { offset: page.offset + page.limit, limit: page.offset === 0 ? 50 : 100 } : undefined,
  });
  const rows = [...new Map((query.data?.pages.flatMap(p => p.conversations) ?? []).map(c => [c.id, c])).values()];
  const config = query.data?.pages[0]?.config;
  return <div className="space-y-4">
    {config && <div className="rounded-2xl border border-[var(--border)] bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>Email agents · {config.mode.toUpperCase()}</strong><button className={control} onClick={() => query.refetch()}>Refresh</button></div>
      <p className="mt-2 text-muted">{config.mode === "draft" ? "Replies are saved for review. No emails or Freshdesk tickets are sent." : config.mode === "pilot" ? "Delivery is restricted to the configured internal test emails." : config.mode === "off" ? "Processing is paused. Incoming messages remain saved." : "Automatic replies are enabled."}</p>
      <p className="mt-2 text-xs text-muted">Provider: {config.provider} · Model: {config.model || "Not configured"} · Reply delay: {config.minDelay}–{config.maxDelay} minutes</p>
      <div className="mt-3 flex flex-wrap gap-2">{([ ["Inbound webhook", config.inboundConfigured], ["AI", config.llmConfigured], ["Reply webhook", config.outboundConfigured], ["Human group", config.freshdeskConfigured], ["Human events", config.humanWebhookConfigured], ["Worker key", config.jobConfigured], ...(config.mode === "pilot" ? [["Test recipients", config.pilotRecipientsConfigured]] : []) ] as [string, boolean][]).map(([label, ready]) => <span key={label} className={`rounded-lg px-2 py-1 text-xs ${ready ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{label}: {ready ? "Configured" : "Pending"}</span>)}</div>
    </div>}
    <form onSubmit={e => { e.preventDefault(); setSearch(q.trim()); }} className="flex flex-wrap gap-2">
      <input aria-label="Search email conversations" className={`${control} min-w-48 flex-1`} placeholder="Search subject, name or email" value={q} onChange={e => setQ(e.target.value)} />
      <button className={control}>Search</button>
      <select aria-label="Agent tier" className={control} value={tier} onChange={e => setTier(e.target.value)}><option value="">All tiers</option>{["T1", "T2", "T3"].map(t => <option key={t}>{t}</option>)}</select>
      <select aria-label="Conversation owner" className={control} value={owner} onChange={e => setOwner(e.target.value)}><option value="">All owners</option><option value="agent">AI agent</option><option value="human">Human support</option></select>
      <select aria-label="Sort date" className={control} value={orderBy} onChange={e => setOrderBy(e.target.value)}><option value="updated">Last activity</option><option value="created">Received date</option></select>
      <select aria-label="Sort direction" className={control} value={direction} onChange={e => setDirection(e.target.value)}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select>
    </form>
    {query.isLoading ? <p className="text-muted">Loading first 10 conversations…</p> : query.error ? <p role="alert" className="text-rose-700">Email support could not load. Check that the support email database migration has been applied.</p> : <>
      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase text-muted"><tr>{["Conversation", "Tier", "Owner", "Status", "Last activity"].map(h => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-[var(--border)]">
        {rows.map(c => <tr key={c.id} className="hover:bg-[var(--surface)]"><td className="px-4 py-3"><button onClick={() => setSelected(c.id)} className="text-left font-semibold text-[var(--accent)] hover:underline">{c.subject || "(no subject)"}</button><p className="text-xs text-muted">{c.name || c.email}{c.name ? ` · ${c.email}` : ""}</p></td><td className="px-4 py-3">{c.tier}</td><td className="px-4 py-3">{c.owner === "human" ? "Human" : "AI"} · {c.language}</td><td className="px-4 py-3">{c.status.replaceAll("_", " ")}</td><td className="px-4 py-3 text-muted">{date(c.updatedAt)}</td></tr>)}
        {!rows.length && <tr><td colSpan={5} className="p-8 text-center text-muted">No email conversations yet.</td></tr>}
      </tbody></table></div>
      <div className="flex items-center justify-between text-sm text-muted"><span>{rows.length} of {query.data?.pages[0]?.total ?? 0} conversations</span>{query.hasNextPage && <button className={control} disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading…" : `Load ${query.data?.pages.length === 1 ? 50 : 100} more`}</button>}</div>
    </>}
    {selected && <EmailConversation id={selected} close={() => setSelected(null)} />}
  </div>;
}

function EmailConversation({ id, close }: { id: string; close: () => void }) {
  const canWrite = useCan("tickets:write");
  const cache = useQueryClient();
  const [confirmedMessageId, setConfirmedMessageId] = useState("");
  const [confirmedFreshdeskId, setConfirmedFreshdeskId] = useState("");
  const query = useQuery({ queryKey: ["support-email-detail", id], queryFn: () => adminApi<Details>(`/api/admin/support/email/${id}`) });
  const mutation = useMutation({
    mutationFn: (input: { action: string; jobId?: string; providerMessageId?: string; freshdeskId?: number }) => adminApi(`/api/admin/support/email/${id}`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async () => { await Promise.all([cache.invalidateQueries({ queryKey: ["support-email-detail", id] }), cache.invalidateQueries({ queryKey: ["support-email"] })]); },
  });
  const data = query.data;
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="email-conversation-title"><div className="mx-auto max-w-4xl space-y-5 rounded-3xl bg-white p-5 sm:p-8">
    <div className="flex items-start justify-between gap-4"><h2 id="email-conversation-title" className="text-xl font-bold">{data?.conversation.subject || "Email conversation"}</h2><button autoFocus className={control} onClick={close}>Close</button></div>
    {query.error && <p role="alert" className="text-rose-700">Could not load this conversation.</p>}
    {!data ? <p>Loading…</p> : <>
      <p className="text-sm text-muted">{data.conversation.email} · {data.conversation.tier} · {data.conversation.owner} · {data.conversation.status.replaceAll("_", " ")}{data.conversation.freshdeskId ? ` · Freshdesk #${data.conversation.freshdeskId}` : ""}</p>
      {data.conversation.escalationReason && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{data.conversation.escalationReason}</p>}
      {canWrite && <div className="flex gap-2"><button className={control} disabled={mutation.isPending} onClick={() => mutation.mutate({ action: data.conversation.owner === "human" ? "resume" : "takeover" })}>{data.conversation.owner === "human" ? "Resume AI for next email" : "Assign to human"}</button></div>}
      {mutation.error && <p role="alert" className="text-sm text-rose-700">{mutation.error.message.replaceAll("_", " ")}</p>}
      <div className="space-y-3">{data.messages.map(m => <article key={m.id} className={`rounded-2xl border p-4 ${m.direction === "incoming" ? "border-[var(--border)]" : "border-emerald-100 bg-emerald-50/40"}`}><p className="mb-2 text-xs font-semibold text-muted">{m.direction === "incoming" ? "Customer" : m.direction === "human" ? "Human / Freshdesk event" : "Agent"} · {date(m.receivedAt)}</p><p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>{m.attachments.length > 0 && <p className="mt-2 text-xs text-muted">Attachments: {m.attachments.map(a => a.name).join(", ")} · Available through the email provider</p>}</article>)}</div>
      <div className="space-y-3">{data.jobs.filter(j => !["succeeded", "cancelled"].includes(j.status)).map(j => <article key={j.id} className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4"><p className="font-semibold">{j.stage === "send" ? "Reply" : "Processing"} · {j.status.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted">Earliest send: {date(j.sendAfter)}</p>{j.draft?.reply && <p className="mt-3 whitespace-pre-wrap text-sm">{j.draft.reply}</p>}{j.error && <p className="mt-2 text-sm text-amber-900">{j.error.replaceAll("_", " ")}</p>}
        {canWrite && <div className="mt-3 flex flex-wrap gap-2">
          {j.status === "review" && <button className={control} disabled={mutation.isPending || !data.canDeliver} onClick={() => mutation.mutate({ action: "approve", jobId: j.id })}>Approve scheduled reply</button>}
          {["blocked", "failed"].includes(j.status) && <button className={control} disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "retry", jobId: j.id })}>Retry after fixing configuration</button>}
          {j.status === "unknown" && <div className="w-full space-y-2 text-sm"><p>Check n8n or Freshdesk before resolving this attempt. Automatic retries are stopped.</p>{j.stage === "send" ? <div className="flex flex-wrap gap-2"><input className={control} aria-label="Confirmed provider message ID" placeholder="Confirmed Gmail message ID" value={confirmedMessageId} onChange={e => setConfirmedMessageId(e.target.value)} /><button className={control} disabled={mutation.isPending || !confirmedMessageId.trim()} onClick={() => mutation.mutate({ action: "confirm_sent", jobId: j.id, providerMessageId: confirmedMessageId.trim() })}>Record confirmed send</button></div> : <div className="flex flex-wrap gap-2"><input className={control} aria-label="Confirmed Freshdesk ticket ID" placeholder="Verified Freshdesk ticket ID" inputMode="numeric" value={confirmedFreshdeskId} onChange={e => setConfirmedFreshdeskId(e.target.value)} /><button className={control} disabled={mutation.isPending || !/^[1-9]\d*$/.test(confirmedFreshdeskId)} onClick={() => mutation.mutate({ action: "confirm_synced", jobId: j.id, freshdeskId: Number(confirmedFreshdeskId) })}>I verified the ticket / note exists</button></div>}<button className={control} disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "confirm_not_sent", jobId: j.id })}>I verified nothing was sent — retry</button></div>}
        </div>}
        {j.status === "review" && !data.canDeliver && <p className="mt-2 text-xs text-muted">Enable pilot mode and allow this internal recipient before approving delivery.</p>}
      </article>)}</div>
    </>}
  </div></div>;
}
