"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { FadeUp, PageHeader } from "@/components/ui";
import { FaqList, usePublishedFaq } from "@/components/FaqList";
import { groupByKnowledgeCategory } from "@/lib/knowledge";

/** Every published webapp article, grouped by category, in the order staff arranged them. */
export default function KnowledgeBasePage() {
  const query = usePublishedFaq();
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const articles = (query.data?.articles ?? []).filter((a) => !needle || a.title.toLowerCase().includes(needle) || a.html.replace(/<[^>]+>/g, " ").toLowerCase().includes(needle));
  const groups = groupByKnowledgeCategory(articles);

  return (
    <div>
      <PageHeader title="Knowledge base" subtitle="Answers to common questions" backHref="/support" />
      <FadeUp className="px-5">
        <label className="card flex min-h-[52px] items-center gap-2 rounded-2xl px-3.5">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search answers…"
            aria-label="Search answers"
            className="w-full bg-transparent py-3 text-base placeholder:text-muted focus:outline-none"
          />
        </label>
      </FadeUp>
      {query.isLoading ? (
        <p className="mt-6 px-5 text-base text-muted">Loading…</p>
      ) : query.error ? (
        <div className="card mx-5 mt-6 rounded-2xl p-6 text-center text-base text-muted">We couldn&apos;t load the answers. Please try again.</div>
      ) : groups.length === 0 ? (
        <div className="card mx-5 mt-6 rounded-2xl p-6 text-center text-base text-muted">{needle ? "No answers match your search." : "No answers yet."}</div>
      ) : (
        groups.map((g, i) => (
          <FadeUp key={g.category} delay={0.04 * Math.min(i, 4)} className="mt-6 px-5">
            <h2 className="mb-3 font-display text-lg font-bold text-[var(--text)]">{g.category}</h2>
            <FaqList articles={g.items} />
          </FadeUp>
        ))
      )}
    </div>
  );
}
