"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight } from "lucide-react";
import { FadeUp } from "@/components/ui";

type EbookCard = { id: string; title: string; summary: string; category: string; coverUrl: string | null; chapterCount: number; resumeChapter: number | null };

export default function LearnPage() {
  const query = useQuery({ queryKey: ["learn-ebooks"], queryFn: async () => { const res = await fetch("/api/content/ebooks"); if (!res.ok) throw new Error("ebooks_unavailable"); return res.json() as Promise<{ ebooks: EbookCard[] }>; } });
  const [category, setCategory] = useState<string | null>(null);
  const all = query.data?.ebooks ?? [];
  const categories = [...new Set(all.map((e) => e.category))];
  const visible = all.filter((e) => !category || e.category === category);
  const chip = (value: string | null, label: string) => (
    <button
      key={label}
      onClick={() => setCategory(value)}
      aria-pressed={category === value}
      className={`min-h-[44px] shrink-0 rounded-full border px-4 text-sm font-semibold ${category === value ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text)]"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="pt-8">
      <FadeUp className="px-5">
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Learn</h1>
        <p className="mt-1 text-base text-muted">Short guides to get the most from your routine.</p>
      </FadeUp>

      {categories.length > 1 && (
        <FadeUp delay={0.04} className="mt-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {chip(null, "All")}
          {categories.map((c) => chip(c, c))}
        </FadeUp>
      )}

      <FadeUp delay={0.06} className="mt-5 space-y-3 px-5 pb-6">
        {query.isLoading ? (
          <p className="text-base text-muted">Loading…</p>
        ) : query.error ? (
          <div className="card rounded-2xl p-6 text-center text-base text-muted">
            We couldn&apos;t load the library. <button className="font-semibold text-[var(--accent)] underline" onClick={() => query.refetch()}>Try again</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="card rounded-2xl p-6 text-center text-base text-muted">New guides are on the way — check back soon.</div>
        ) : (
          visible.map((e) => (
            <Link key={e.id} href={`/learn/${e.id}`} className="card flex items-center gap-4 rounded-2xl p-4 active:scale-[0.99]">
              {e.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- served by our own image route
                <img src={e.coverUrl} alt="" className="h-24 w-[4.5rem] shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="flex h-24 w-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                  <BookOpen className="h-7 w-7 text-[var(--accent)]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">{e.category}</p>
                <p className="mt-0.5 text-base font-semibold leading-snug text-[var(--text)]">{e.title}</p>
                {e.summary && <p className="mt-1 line-clamp-2 text-sm text-muted">{e.summary}</p>}
                <p className="mt-1.5 text-sm font-semibold text-[var(--accent)]">
                  {e.resumeChapter !== null ? `Continue · Chapter ${e.resumeChapter + 1} of ${e.chapterCount}` : `${e.chapterCount} ${e.chapterCount === 1 ? "chapter" : "chapters"} · Start reading`}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
            </Link>
          ))
        )}
      </FadeUp>
    </div>
  );
}
