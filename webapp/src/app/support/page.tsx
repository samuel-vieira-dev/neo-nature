"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, MessageCirclePlus, Clock, CheckCircle2, CircleDot, Search, Sparkles, Send } from "lucide-react";
import { useTickets } from "@/lib/hooks";
import { FadeUp, PageHeader, Chip, CTA } from "@/components/ui";
import { faqs } from "@/lib/data";

const suggestions = ["When will I feel results?", "What's this charge on my card?", "How do I pause my subscription?"];

function AskAI() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ answer: string; source: string; related: string[] } | null>(null);

  const ask = async (q: string) => {
    if (q.trim().length < 3 || busy) return;
    setQuestion(q);
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/faq/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (res.ok) setResult(await res.json());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-strong rounded-3xl p-4">
      <div className="flex items-center gap-2">
        <div className="glass flex flex-1 items-center gap-2 rounded-2xl px-3.5">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(question)}
            placeholder="Ask anything — results, charges, shipping…"
            className="w-full bg-transparent py-3 text-sm placeholder:text-white/25 focus:outline-none"
          />
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => ask(question)}
          className="grad flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
        >
          <Send className="h-4 w-4 text-emerald-950" />
        </motion.button>
      </div>

      {/* auto-suggestions */}
      {!result && !busy && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="glass shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold text-muted"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {busy && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 flex items-center gap-2 px-1 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-emerald-300" /> Thinking…
          </motion.div>
        )}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-2xl bg-emerald-400/8 p-4"
          >
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
              <Sparkles className="h-3 w-3" /> {result.source === "ai" ? "AI answer" : "From our FAQ"}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-white/85">{result.answer}</p>
            {result.related.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {result.related.map((r) => (
                  <button key={r} onClick={() => ask(r)} className="rounded-full bg-white/6 px-2.5 py-1 text-[10px] text-muted">
                    {r}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const ticketStatus = {
  open: { tone: "amber" as const, label: "Open", icon: CircleDot },
  in_review: { tone: "blue" as const, label: "In review", icon: Clock },
  resolved: { tone: "green" as const, label: "Resolved", icon: CheckCircle2 },
};

export default function SupportPage() {
  const { data } = useTickets();
  const tickets = data?.tickets ?? [];
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div>
      <PageHeader title="Support" subtitle="We reply within 24 hours — usually much faster" backHref="/" />

      {/* AI FAQ search — deflection before tickets (doc §8) */}
      <FadeUp className="px-5">
        <AskAI />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-4 px-5">
        <CTA href="/support/new">
          <MessageCirclePlus className="h-5 w-5" /> Open a ticket
        </CTA>
        <p className="mt-2 text-center text-[11px] text-muted">
          Problems, refunds, wrong items — we make it right, no hoops.
        </p>
      </FadeUp>

      {/* tickets */}
      <FadeUp delay={0.08} className="mt-6 px-5">
        <h3 className="mb-3 font-display text-lg font-bold">Your tickets</h3>
        {tickets.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center text-sm text-muted">No tickets yet — all smooth 🙌</div>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => {
              const s = ticketStatus[t.status];
              return (
                <div key={t.id} className="glass rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold leading-snug">{t.subject}</p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {t.id} · Order {t.orderNumber} · {t.date}
                      </p>
                    </div>
                    <Chip tone={s.tone}>{s.label}</Chip>
                  </div>
                  <p className="mt-3 rounded-xl bg-white/4 p-3 text-xs leading-relaxed text-muted">
                    <span className="font-semibold text-emerald-300">Neo Nature team:</span> {t.lastMessage}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </FadeUp>

      {/* FAQ */}
      <FadeUp delay={0.14} className="mt-6 px-5">
        <h3 className="mb-3 font-display text-lg font-bold">Quick answers</h3>
        <div className="space-y-2.5">
          {faqs.map((f, i) => {
            const open = openFaq === i;
            return (
              <div key={i} className="glass overflow-hidden rounded-2xl">
                <button
                  onClick={() => setOpenFaq(open ? null : i)}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-semibold"
                >
                  {f.q}
                  <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
                    <ChevronDown className="h-4 w-4 text-muted" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.21, 0.65, 0.36, 1] }}
                    >
                      <p className="px-4 pb-4 text-xs leading-relaxed text-muted">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </FadeUp>

      <FadeUp delay={0.2} className="mt-6 px-5 text-center">
        <p className="text-[11px] text-muted">
          Prefer email? <Link href="/support/new" className="font-semibold text-emerald-300">support@neonature.com</Link>
        </p>
      </FadeUp>
    </div>
  );
}
