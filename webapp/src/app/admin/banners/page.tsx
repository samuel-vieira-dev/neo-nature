"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Trash2, CheckCircle2, Circle } from "lucide-react";
import { adminApi } from "@/lib/adminApi";

type Banner = { id: number; title: string; body: string; ctaLabel: string | null; ctaUrl: string | null; active: boolean };

export default function AdminBannersPage() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [activateNew, setActivateNew] = useState(true);

  const { data } = useQuery({ queryKey: ["admin-banners"], queryFn: () => adminApi<{ banners: Banner[] }>("/api/admin/banners") });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-banners"] });

  const create = useMutation({
    mutationFn: () =>
      adminApi("/api/admin/banners", {
        method: "POST",
        body: JSON.stringify({ title, body, ctaLabel: ctaLabel || null, ctaUrl: ctaUrl || null, active: activateNew }),
      }),
    onSuccess: () => { setTitle(""); setBody(""); setCtaLabel(""); setCtaUrl(""); invalidate(); },
  });
  const patch = useMutation({
    mutationFn: (b: { id: number; active?: boolean }) => adminApi("/api/admin/banners", { method: "PATCH", body: JSON.stringify(b) }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => adminApi("/api/admin/banners", { method: "DELETE", body: JSON.stringify({ id }) }),
    onSuccess: invalidate,
  });

  const banners = data?.banners ?? [];
  const canCreate = title.trim() && body.trim() && !create.isPending;

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-bold text-[var(--text)]">Banners</h1>
      <p className="mt-1 text-sm text-muted">The active banner shows at the top of every customer&apos;s home screen.</p>

      {/* create */}
      <div className="mt-4 space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-[var(--text)]"><Plus className="h-4 w-4 text-[var(--accent)]" /> New banner</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Title — e.g. Free shipping this week 🚚" className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} rows={2} placeholder="Message" className="w-full resize-none rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
        <div className="flex gap-2">
          <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={40} placeholder="Button label (optional)" className="flex-1 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
          <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} maxLength={200} placeholder="Link (optional)" className="flex-1 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={activateNew} onChange={(e) => setActivateNew(e.target.checked)} /> Make active immediately
        </label>
        <button onClick={() => create.mutate()} disabled={!canCreate} className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl py-2.5 font-display font-bold text-white ${canCreate ? "bg-[var(--accent)]" : "bg-[var(--border)] text-muted"}`}>
          {create.isPending ? "Creating…" : "Create banner"}
        </button>
      </div>

      {/* list */}
      <div className="mt-4 space-y-3">
        {banners.map((b) => (
          <div key={b.id} className={`rounded-2xl border bg-white p-4 ${b.active ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                <Megaphone className="h-4 w-4 text-[var(--accent)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--text)]">{b.title}</p>
                <p className="text-sm text-muted">{b.body}</p>
                {b.ctaLabel && <p className="mt-1 text-xs text-[var(--accent)]">{b.ctaLabel} → {b.ctaUrl}</p>}
              </div>
              {b.active && <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent)]">Active</span>}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => patch.mutate({ id: b.id, active: !b.active })}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] py-2 text-sm font-semibold text-[var(--text)]"
              >
                {b.active ? <><Circle className="h-4 w-4" /> Deactivate</> : <><CheckCircle2 className="h-4 w-4 text-[var(--accent)]" /> Make active</>}
              </button>
              <button onClick={() => remove.mutate(b.id)} className="flex items-center justify-center rounded-xl border border-[var(--border)] px-3 py-2 text-rose-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {banners.length === 0 && <p className="py-6 text-center text-sm text-muted">No banners yet.</p>}
      </div>
    </div>
  );
}
