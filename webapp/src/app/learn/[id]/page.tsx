"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui";
import EbookReader from "@/components/EbookReader";
import { ThemeToggleButton } from "@/components/ThemeControls";
import type { ReaderEbook } from "@/lib/content";

export default function EbookPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["learn-ebook", id],
    queryFn: async () => { const res = await fetch(`/api/content/ebooks/${encodeURIComponent(id)}`); if (!res.ok) throw new Error(res.status === 404 ? "not_found" : "unavailable"); return res.json() as Promise<{ ebook: ReaderEbook; resumeChapter: number }>; },
    retry: (n, e) => e.message !== "not_found" && n < 2,
    refetchOnWindowFocus: false,
  });
  const [chapter, setChapter] = useState<number | null>(null);
  const ebook = query.data?.ebook;
  const at = chapter ?? query.data?.resumeChapter ?? 0;
  const chapterId = ebook?.chapters[at]?.id;

  // Best effort: a failed save only means the reader starts at the previous chapter next time.
  useEffect(() => {
    if (!chapterId) return;
    void fetch(`/api/content/ebooks/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterId }) }).catch(() => {});
  }, [id, chapterId]);

  const go = (index: number) => { setChapter(index); window.scrollTo({ top: 0 }); };

  return (
    <div>
      <PageHeader title="Learn" backHref="/learn" action={<ThemeToggleButton />} />
      {query.isLoading ? (
        <p className="px-5 text-base text-muted">Loading…</p>
      ) : !ebook ? (
        <div className="card mx-5 rounded-2xl p-6 text-center text-base text-muted">
          {query.error?.message === "not_found" ? "This guide is no longer available." : "We couldn't load this guide. Please try again."}
        </div>
      ) : (
        <EbookReader ebook={ebook} chapter={at} onChapter={go} />
      )}
    </div>
  );
}
