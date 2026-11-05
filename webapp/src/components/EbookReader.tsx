"use client";

import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { RICH_TEXT } from "@/lib/knowledge";
import type { ReaderEbook } from "@/lib/content";

/**
 * Chapter-by-chapter e-book reader. Shared by the webapp (/learn/[id]) and the admin live
 * preview, so what editors see is exactly what customers get. `html` must already be sanitized.
 */
export default function EbookReader({ ebook, chapter, onChapter }: { ebook: ReaderEbook; chapter: number; onChapter: (index: number) => void }) {
  const total = ebook.chapters.length;
  const at = Math.min(Math.max(chapter, 0), Math.max(total - 1, 0));
  const current = ebook.chapters[at];

  return (
    <article className="px-5 pb-8">
      <header className="flex items-start gap-4">
        {ebook.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- served by our own image route, sizes vary
          <img src={ebook.coverUrl} alt="" className="h-24 w-[4.5rem] shrink-0 rounded-xl object-cover shadow-sm" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">{ebook.category}</p>
          <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-[var(--text)]">{ebook.title || "Untitled e-book"}</h1>
          {total > 0 && <p className="mt-1 text-sm text-muted">Chapter {at + 1} of {total}</p>}
        </div>
      </header>

      {total > 1 && (
        <details className="card mt-5 rounded-2xl">
          <summary className="flex min-h-[52px] cursor-pointer items-center gap-2 px-4 text-base font-semibold text-[var(--text)]">
            <List className="h-5 w-5 text-[var(--accent)]" /> All chapters
          </summary>
          <ol className="space-y-1 px-2 pb-3">
            {ebook.chapters.map((c, i) => (
              <li key={c.id}>
                <button
                  onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); onChapter(i); }}
                  aria-current={i === at ? "true" : undefined}
                  className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-base ${i === at ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]" : "text-[var(--text)]"}`}
                >
                  <span className="w-6 shrink-0 text-sm text-muted">{i + 1}</span>
                  {c.title || `Chapter ${i + 1}`}
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}

      {current ? (
        <section className="mt-6">
          <h2 className="font-display text-xl font-bold text-[var(--text)]">{current.title || `Chapter ${at + 1}`}</h2>
          <div className={`mt-3 text-[17px] leading-8 text-[var(--text)] ${RICH_TEXT}`} dangerouslySetInnerHTML={{ __html: current.html }} />
        </section>
      ) : (
        <p className="mt-6 text-base text-muted">This e-book has no chapters yet.</p>
      )}

      {total > 1 && (
        <nav aria-label="Chapter navigation" className="mt-8 grid grid-cols-2 gap-3">
          <button
            onClick={() => onChapter(at - 1)}
            disabled={at === 0}
            className="card flex min-h-[56px] items-center justify-center gap-1 rounded-2xl text-base font-semibold text-[var(--text)] disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" /> Previous
          </button>
          <button
            onClick={() => onChapter(at + 1)}
            disabled={at === total - 1}
            className="flex min-h-[56px] items-center justify-center gap-1 rounded-2xl bg-[var(--accent-solid)] text-base font-bold text-white disabled:opacity-40"
          >
            Next chapter <ChevronRight className="h-5 w-5" />
          </button>
        </nav>
      )}
      {total > 0 && at === total - 1 && <p className="mt-6 text-center text-sm text-muted">You&apos;ve reached the end of this e-book.</p>}
    </article>
  );
}
