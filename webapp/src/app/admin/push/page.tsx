"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, BellRing, CheckCircle2 } from "lucide-react";
import { adminApi } from "@/lib/adminApi";

type Resp = { facets: { origins: string[]; products: string[] }; filteredCount: number };

export default function AdminPushPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [origin, setOrigin] = useState("");
  const [product, setProduct] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<{ sent: number; targeted: number } | null>(null);

  const filters = { origin: origin || undefined, product: product || undefined, status: (status || undefined) as "active" | "churned" | undefined };

  // reachable audience preview (only push-reachable customers matching filters)
  const params = new URLSearchParams({ reachable: "1" });
  if (origin) params.set("origin", origin);
  if (product) params.set("product", product);
  if (status) params.set("status", status);

  const { data } = useQuery({
    queryKey: ["admin-push-audience", params.toString()],
    queryFn: () => adminApi<Resp>(`/api/admin/customers?${params.toString()}`),
  });

  const send = useMutation({
    mutationFn: () =>
      adminApi<{ ok: true; sent: number; targeted: number }>("/api/admin/push/send", {
        method: "POST",
        body: JSON.stringify({ title, body, url: url || undefined, filters }),
      }),
    onSuccess: (r) => setResult({ sent: r.sent, targeted: r.targeted }),
  });

  const reach = data?.filteredCount ?? 0;
  const canSend = title.trim().length > 0 && body.trim().length > 0 && reach > 0 && !send.isPending;

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-bold text-[var(--text)]">Push campaign</h1>
      <p className="mt-1 text-sm text-muted">Send a notification to a filtered audience. Only customers with the app and notifications enabled receive it.</p>

      {/* compose */}
      <div className="mt-4 space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
        <div>
          <label className="text-xs font-semibold text-muted">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. New: GlucoEase restocked 🌿" className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted">Message</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} rows={3} placeholder="Your message to customers…" className="mt-1 w-full resize-none rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted">Link (optional)</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/orders" className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
        </div>
      </div>

      {/* audience */}
      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-5">
        <p className="text-sm font-bold text-[var(--text)]">Audience</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-semibold">
            <option value="">All origins</option>
            {data?.facets.origins.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={product} onChange={(e) => setProduct(e.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-semibold">
            <option value="">All products</option>
            {data?.facets.products.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-semibold">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="churned">Churned</option>
          </select>
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm">
          <BellRing className="h-4 w-4 text-[var(--accent)]" />
          <span className="font-bold text-[var(--text)]">{reach}</span>
          <span className="text-muted">reachable customer{reach === 1 ? "" : "s"} will receive this</span>
        </p>
      </div>

      {/* send */}
      <button
        onClick={() => { setResult(null); send.mutate(); }}
        disabled={!canSend}
        className={`mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl py-3 font-display text-base font-bold text-white ${canSend ? "bg-[var(--accent)]" : "bg-[var(--border)] text-muted"}`}
      >
        <Send className="h-4 w-4" /> {send.isPending ? "Sending…" : `Send to ${reach}`}
      </button>

      {result && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-5 w-5" /> Sent to {result.sent} of {result.targeted} customers.
        </div>
      )}
    </div>
  );
}
