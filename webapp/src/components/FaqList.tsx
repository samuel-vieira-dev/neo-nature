"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { RICH_TEXT } from "@/lib/knowledge";

export type FaqArticle = { id: string; title: string; html: string; category: string; featured: boolean };

export function usePublishedFaq() {
  return useQuery({
    queryKey: ["published-faq"],
    queryFn: async () => {
      const res = await fetch("/api/faq");
      if (!res.ok) throw new Error("faq_unavailable");
      return res.json() as Promise<{ articles: FaqArticle[] }>;
    },
  });
}

/** Accordion of knowledge articles; `html` is sanitized server-side (allowlisted tags, own image route only). */
export function FaqList({ articles }: { articles: FaqArticle[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-2.5">
      {articles.map((a) => {
        const isOpen = open === a.id;
        return (
          <div key={a.id} className="card overflow-hidden rounded-2xl">
            <button
              onClick={() => setOpen(isOpen ? null : a.id)}
              aria-expanded={isOpen}
              className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-base font-semibold text-[var(--text)]"
            >
              {a.title}
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
                  <div className={`px-4 pb-4 text-sm leading-relaxed text-muted ${RICH_TEXT}`} dangerouslySetInnerHTML={{ __html: a.html }} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
