"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, MessageCirclePlus, Clock, CheckCircle2, CircleDot, Search, Sparkles, Send, Phone } from "lucide-react";
import { useTickets } from "@/lib/hooks";
import { FadeUp, PageHeader, Chip, CTA } from "@/components/ui";
import { useQuery } from "@tanstack/react-query";
import { RICH_TEXT } from "@/lib/knowledge";

const suggestions = ["When will I feel results?", "What's this charge on my card?", "What's your refund policy?"];

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
    <div className="card rounded-3xl p-4">
      <div className="flex items-center gap-2">
        <div className="card flex flex-1 items-center gap-2 rounded-2xl px-3.5">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(question)}
            onFocus={() => result && setQuestion("")}
            placeholder="Ask anything — results, charges, shipping…"
            className="w-full bg-transparent py-3 text-base placeholder:text-muted focus:outline-none"
          />
        </div>
        <button
          onClick={() => ask(question)}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]"
          aria-label="Ask"
        >
          <Send className="h-4 w-4 text-white" />
        </button>
      </div>

      {/* auto-suggestions */}
      {!result && !busy && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="card shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-muted"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {busy && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 flex items-center gap-2 px-1 text-sm text-muted">
            <Sparkles className="h-4 w-4 text-[var(--accent)]" /> Thinking…
          </motion.div>
        )}
        {result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-2xl bg-[var(--accent-soft)] p-4"
          >
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--accent-strong)]">
              <Sparkles className="h-3.5 w-3.5" /> {result.source === "ai" ? "AI answer" : "From our FAQ"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text)]">{result.answer}</p>
            {result.related.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {result.related.map((r) => (
                  <button key={r} onClick={() => ask(r)} className="rounded-full bg-white px-2.5 py-1 text-xs text-muted">
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
  new: { tone: "amber" as const, label: "New", icon: CircleDot },
  pending: { tone: "blue" as const, label: "Pending", icon: Clock },
  on_hold: { tone: "blue" as const, label: "On hold", icon: Clock },
  closed: { tone: "green" as const, label: "Closed", icon: CheckCircle2 },
  open: { tone: "amber" as const, label: "Open", icon: CircleDot },
  in_review: { tone: "blue" as const, label: "In review", icon: Clock },
  resolved: { tone: "green" as const, label: "Resolved", icon: CheckCircle2 },
};

export default function SupportPage() {
  const { data } = useTickets();
  const tickets = data?.tickets ?? [];
  const knowledge = useQuery({ queryKey: ["published-faq"], queryFn: async () => { const res=await fetch("/api/faq"); if(!res.ok) throw new Error("faq_unavailable"); return res.json() as Promise<{articles:{id:string;title:string;content:string;html:string}[]}>; } });
  // `html` is sanitized server-side (allowlisted tags, own image route only).
  const faqs=(knowledge.data?.articles ?? []).map(a=>({q:a.title,html:a.html}));
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div>
      <PageHeader title="Support" subtitle="We reply in about 1 hour on average" backHref="/" />

      {/* AI FAQ search */}
      <FadeUp className="px-5">
        <AskAI />
      </FadeUp>

      <FadeUp delay={0.04} className="mt-4 px-5">
        <CTA href="/support/new">
          <MessageCirclePlus className="h-5 w-5" /> Open a ticket
        </CTA>
        <a
          href="tel:+18772864137"
          className="mt-3 flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-amber-600 text-base font-bold text-white active:bg-amber-700"
        >
          <Phone className="h-5 w-5 text-white" /> Call us · +1 877 286 4137
        </a>
        <p className="mt-2 text-center text-sm text-muted">
          Problems, refunds, wrong items — we make it right, no hoops.
        </p>
      </FadeUp>

      {/* tickets */}
      <FadeUp delay={0.06} className="mt-6 px-5">
        <h3 className="mb-3 font-display text-lg font-bold text-[var(--text)]">Your tickets</h3>
        {tickets.length === 0 ? (
          <div className="card rounded-2xl p-6 text-center text-base text-muted">No tickets yet — all smooth 🙌</div>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => {
              const s = ticketStatus[t.status as keyof typeof ticketStatus] ?? { tone: "blue" as const, label: t.status.replaceAll("_", " "), icon: Clock };
              return (
                <div key={t.id} className="card rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold leading-snug text-[var(--text)]">{t.subject}</p>
                      <p className="mt-0.5 text-sm text-muted">
                        {t.id} · Order {t.orderNumber} · {t.date}
                      </p>
                    </div>
                    <Chip tone={s.tone}>{s.label}</Chip>
                  </div>
                  {(data?.messages ?? []).filter(m=>m.legacyTicketId===t.id).length ? <details className="mt-3 rounded-xl bg-[var(--surface)] p-3 text-sm"><summary className="cursor-pointer font-semibold">View conversation</summary><div className="mt-3 space-y-3">{data!.messages.filter(m=>m.legacyTicketId===t.id).map(m=><article key={m.id}><p className="text-xs text-muted">{m.direction==="incoming" ? "You" : "Neo Nature team"} · {new Date(m.receivedAt).toLocaleString()}</p><p className="whitespace-pre-wrap">{m.text}</p></article>)}</div></details> : <p className="mt-3 rounded-xl bg-[var(--surface)] p-3 text-sm leading-relaxed text-muted"><span className="font-semibold text-[var(--accent)]">Neo Nature team:</span> {t.lastMessage}</p>}
                </div>
              );
            })}
          </div>
        )}
      </FadeUp>

      {/* FAQ */}
      <FadeUp delay={0.1} className="mt-6 px-5">
        <h3 className="mb-3 font-display text-lg font-bold text-[var(--text)]">Quick answers</h3>
        <div className="space-y-2.5">
          {faqs.map((f, i) => {
            const open = openFaq === i;
            return (
              <div key={i} className="card overflow-hidden rounded-2xl">
                <button
                  onClick={() => setOpenFaq(open ? null : i)}
                  className="flex min-h-[52px] w-full items-center justify-between px-4 py-3.5 text-left text-base font-semibold text-[var(--text)]"
                >
                  {f.q}
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className={`px-4 pb-4 text-sm leading-relaxed text-muted ${RICH_TEXT}`} dangerouslySetInnerHTML={{ __html: f.html }} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </FadeUp>
    </div>
  );
}
