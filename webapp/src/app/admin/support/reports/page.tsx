"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download } from "lucide-react";
import { useCan } from "@/components/AdminProvider";
import NoAccess from "@/components/NoAccess";
import { adminApi } from "@/lib/adminApi";
import { zonedDay } from "@/lib/business-hours";
import type { ResponseStats, SupportReport } from "@/lib/support-report";
import type { AiQuestionsReport, ReportRange } from "@/server/support-reports";

type ReportResp = Omit<SupportReport, "tickets"> & { range: ReportRange; aiQuestions: AiQuestionsReport };

const PRESETS = [7, 30, 90];
const box = "rounded-2xl border border-[var(--border)] bg-[var(--card)]";

function daysAgo(n: number) {
  const d = new Date(`${zonedDay(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const hours = (h: number | null) => (h === null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(n % 1 ? 1 : 0)}%`);
const shortDate = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Tile({ label, value, note }: { label: string; value: string | number; note?: React.ReactNode }) {
  return (
    <div className={`${box} p-4`}>
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-[var(--text)]">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

function ResponseTable({ title, rows, waiting, waitingBreached, slaHours }: { title: string; rows: [string, ResponseStats][]; waiting: number; waitingBreached: number; slaHours: number }) {
  return (
    <section className={`${box} overflow-x-auto`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
        <h2 className="font-display text-lg font-bold text-[var(--text)]">{title}</h2>
        <p className="text-xs text-muted">Waiting now: {waiting} · past {slaHours} h: <span className={waitingBreached ? "font-semibold text-amber-700" : ""}>{waitingBreached}</span></p>
      </div>
      <table className="mt-2 w-full min-w-[440px] whitespace-nowrap text-left text-sm">
        <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-muted">
          <tr><th className="px-3 py-2 font-semibold">Sent by</th><th className="px-3 py-2 text-right font-semibold">Replies</th><th className="px-3 py-2 text-right font-semibold">Median</th><th className="px-3 py-2 text-right font-semibold">Average</th><th className="px-3 py-2 text-right font-semibold">Within {slaHours} h</th></tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map(([label, s]) => (
            <tr key={label}>
              <td className="px-3 py-2 font-semibold text-[var(--text)]">{label}</td>
              <td className="px-3 py-2 text-right tabular-nums">{s.count}</td>
              <td className="px-3 py-2 text-right tabular-nums">{hours(s.median)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{hours(s.average)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{s.count ? `${s.withinSla} (${pct(Math.round((s.withinSla / s.count) * 1000) / 10)})` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function SupportReportsPage() {
  const canRead = useCan("reports:read");
  const canExport = useCan("reports:export");
  const [from, setFrom] = useState(() => daysAgo(29));
  const [to, setTo] = useState(() => daysAgo(0));
  const qs = new URLSearchParams({ from, to }).toString();
  const { data, error, isLoading } = useQuery({
    queryKey: ["support-reports", qs],
    queryFn: () => adminApi<ReportResp>(`/api/admin/support/reports?${qs}`),
    enabled: canRead && from <= to,
  });
  if (!canRead) return <NoAccess />;

  const preset = (n: number) => { setFrom(daysAgo(n - 1)); setTo(daysAgo(0)); };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Support reports</h1>
        <p className="mt-1 text-sm text-muted">
          SLA: first response and every reply within {data?.slaHours ?? 24} business hours (Monday–Friday, US Eastern time). Tickets created in the period; Freshdesk history is not included.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {PRESETS.map((n) => {
          const active = from === daysAgo(n - 1) && to === daysAgo(0);
          return (
            <button key={n} onClick={() => preset(n)} aria-pressed={active} className={`min-h-[40px] rounded-xl border px-3 text-sm font-semibold ${active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--text)]"}`}>
              Last {n} days
            </button>
          );
        })}
        <label className="text-xs font-semibold text-muted">From
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="mt-1 block min-h-[40px] rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]" />
        </label>
        <label className="text-xs font-semibold text-muted">To
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="mt-1 block min-h-[40px] rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]" />
        </label>
        {canExport && (
          <a href={`/api/admin/support/reports/export?${qs}`} className="ml-auto flex min-h-[40px] items-center gap-2 rounded-xl bg-[var(--accent-solid)] px-4 text-sm font-semibold text-white hover:opacity-90">
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </a>
        )}
      </div>

      {error ? (
        <p className="text-sm text-rose-600">Couldn&apos;t load the reports — try again.</p>
      ) : isLoading || !data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Customer tickets" value={data.totals.customers} note={`${data.totals.notCustomer} not a customer (closed without reply)`} />
            <Tile label="First response within SLA" value={pct(data.firstResponse.slaRate)} note={`Median ${hours(data.firstResponse.median)}`} />
            <Tile label="Replies within SLA" value={pct(data.replies.slaRate)} note={`Median ${hours(data.replies.median)}`} />
            <Tile label="Waiting past SLA now" value={data.breaches.length} note="Listed below" />
            <Tile label="Resolved" value={data.totals.resolved} />
            <Tile label="Closed" value={data.totals.closed} />
            <Tile label="Still open" value={data.totals.open} />
            <Tile label="Median time to resolve" value={hours(data.resolution.median)} note={`${data.resolution.count} ${data.resolution.count === 1 ? "ticket" : "tickets"} · recorded since Nov 4, 2026`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ResponseTable title="First response" rows={[["All", data.firstResponse], ["AI agent", data.firstResponse.ai], ["Staff", data.firstResponse.human]]} waiting={data.firstResponse.waiting} waitingBreached={data.firstResponse.waitingBreached} slaHours={data.slaHours} />
            <ResponseTable title="Later replies" rows={[["All", data.replies], ["AI agent", data.replies.ai], ["Staff", data.replies.human]]} waiting={data.replies.waiting} waitingBreached={data.replies.waitingBreached} slaHours={data.slaHours} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className={`${box} overflow-x-auto`}>
              <h2 className="px-4 pt-4 font-display text-lg font-bold text-[var(--text)]">By tier</h2>
              <table className="mt-2 w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2 font-semibold">Tier</th><th className="px-4 py-2 text-right font-semibold">Tickets</th><th className="px-4 py-2 text-right font-semibold">Median 1st response</th><th className="px-4 py-2 text-right font-semibold">Within SLA</th></tr></thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.byTier.map((t) => <tr key={t.tier}><td className="px-4 py-2 font-semibold">{t.tier}</td><td className="px-4 py-2 text-right tabular-nums">{t.tickets}</td><td className="px-4 py-2 text-right tabular-nums">{hours(t.firstResponseMedian)}</td><td className="px-4 py-2 text-right tabular-nums">{pct(t.slaRate)}</td></tr>)}
                  {!data.byTier.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">No tickets in this period.</td></tr>}
                </tbody>
              </table>
            </section>
            <section className={`${box} overflow-x-auto`}>
              <h2 className="px-4 pt-4 font-display text-lg font-bold text-[var(--text)]">By product</h2>
              <p className="px-4 text-xs text-muted">The order cited in the first message, otherwise the customer&apos;s latest order.</p>
              <table className="mt-2 w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2 font-semibold">Product</th><th className="px-4 py-2 text-right font-semibold">Tickets</th><th className="px-4 py-2 text-right font-semibold">Within SLA</th></tr></thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.byProduct.map((p) => <tr key={p.product}><td className="px-4 py-2">{p.product}</td><td className="px-4 py-2 text-right tabular-nums">{p.tickets}</td><td className="px-4 py-2 text-right tabular-nums">{pct(p.slaRate)}</td></tr>)}
                  {!data.byProduct.length && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted">No tickets in this period.</td></tr>}
                </tbody>
              </table>
            </section>
          </div>

          <section className={`${box} overflow-x-auto`}>
            <h2 className="px-4 pt-4 font-display text-lg font-bold text-[var(--text)]">Waiting past SLA</h2>
            <table className="mt-2 w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2 font-semibold">Ticket</th><th className="px-4 py-2 font-semibold">Tier</th><th className="px-4 py-2 font-semibold">Waiting for</th><th className="px-4 py-2 text-right font-semibold">Business hours</th><th className="px-4 py-2 font-semibold">Created</th></tr></thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.breaches.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2"><Link href={`/admin/support?ticket=${encodeURIComponent(t.id)}`} className="font-semibold text-[var(--accent)] hover:underline">#{t.ticketNumber} · {t.subject || "(no subject)"}</Link></td>
                    <td className="px-4 py-2">{t.tier}</td>
                    <td className="px-4 py-2">{t.waitingFor === "first_response" ? "First response" : "Reply"}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-amber-700">{hours(t.waitingHours)}</td>
                    <td className="px-4 py-2 text-muted">{shortDate(t.createdAt)}</td>
                  </tr>
                ))}
                {!data.breaches.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted"><CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-700" aria-hidden />Nobody is waiting past the SLA.</td></tr>}
              </tbody>
            </table>
          </section>

          <section className={`${box} p-4`}>
            <h2 className="font-display text-lg font-bold text-[var(--text)]">Ask AI questions (app)</h2>
            <p className="mt-1 text-xs text-muted">What customers ask in the app. Recorded since Nov 4, 2026; staff &quot;view as customer&quot; questions are not counted.</p>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile label="Questions" value={data.aiQuestions.total} />
              <Tile label="Answered by AI" value={data.aiQuestions.ai} />
              <Tile label="Search fallback" value={data.aiQuestions.search} />
              <Tile label="About an order" value={data.aiQuestions.orderQuestions} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">Most matched articles</h3>
                <ol className="mt-2 space-y-1 text-sm">
                  {data.aiQuestions.topArticles.map((a) => <li key={a.title} className="flex justify-between gap-3"><span>{a.title}</span><span className="tabular-nums text-muted">{a.count}</span></li>)}
                  {!data.aiQuestions.topArticles.length && <li className="text-muted">No matches yet.</li>}
                </ol>
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">Latest questions</h3>
                <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto text-sm">
                  {data.aiQuestions.recent.map((q, i) => (
                    <li key={i} className="rounded-xl bg-[var(--surface)] px-3 py-2">
                      <p className="text-[var(--text)]">{q.question}</p>
                      <p className="mt-0.5 text-xs text-muted">{shortDate(q.createdAt)} · {q.source === "ai" ? "AI" : "Search"}{q.orderQuestion ? " · order" : ""}</p>
                    </li>
                  ))}
                  {!data.aiQuestions.recent.length && <li className="text-muted">No questions yet.</li>}
                </ul>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
