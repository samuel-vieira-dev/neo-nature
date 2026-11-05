import { businessHoursBetween, SLA_BUSINESS_HOURS } from "./business-hours";

/**
 * Support reports (William, 04/11): first response within 24 business hours overall, and every
 * later reply within 24 business hours. Pure so the rules are tested in one place; the server
 * loads the rows (src/server/support-reports.ts).
 */
export type ReportMessage = { direction: string; authorAdminId: string | null; receivedAt: Date };
export type ReportTicketInput = {
  id: string;
  ticketNumber: number;
  subject: string;
  tier: string;
  ticketStatus: string;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
  product: string | null;
  messages: ReportMessage[];
};
export type Responder = "ai" | "human";

export type ReportTicket = {
  id: string;
  ticketNumber: number;
  subject: string;
  tier: string;
  ticketStatus: string;
  product: string | null;
  notCustomer: boolean;
  createdAt: string;
  firstResponseAt: string | null;
  firstResponder: Responder | null;
  firstResponseHours: number | null;
  replies: { hours: number; responder: Responder }[];
  resolvedAt: string | null;
  resolutionHours: number | null;
  /** Business hours the customer has been waiting for us right now (null when not waiting). */
  waitingHours: number | null;
  waitingFor: "first_response" | "reply" | null;
  slaMet: boolean | null;
};

export type ResponseStats = { count: number; median: number | null; average: number | null; withinSla: number };
export type SupportReport = {
  slaHours: number;
  totals: { tickets: number; customers: number; notCustomer: number; resolved: number; closed: number; open: number };
  byStatus: Record<string, number>;
  firstResponse: ResponseStats & { ai: ResponseStats; human: ResponseStats; waiting: number; waitingBreached: number; slaRate: number | null };
  replies: ResponseStats & { ai: ResponseStats; human: ResponseStats; waiting: number; waitingBreached: number; slaRate: number | null };
  resolution: { count: number; median: number | null; average: number | null };
  byTier: { tier: string; tickets: number; firstResponseMedian: number | null; slaRate: number | null }[];
  byProduct: { product: string; tickets: number; slaRate: number | null }[];
  breaches: ReportTicket[];
  tickets: ReportTicket[];
};

const isClosed = (status: string) => status === "resolved" || status === "closed";
const responderOf = (m: ReportMessage): Responder => (m.authorAdminId ? "human" : "ai");
const round = (n: number) => Math.round(n * 100) / 100;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}

function stats(hours: number[]): ResponseStats {
  return { count: hours.length, median: median(hours), average: hours.length ? round(hours.reduce((a, b) => a + b, 0) / hours.length) : null, withinSla: hours.filter((h) => h <= SLA_BUSINESS_HOURS).length };
}

/** On-time share counting tickets still waiting past the SLA as misses (null with nothing to measure). */
const rate = (within: number, total: number) => (total ? Math.round((within / total) * 1000) / 10 : null);

export function reportTicket(t: ReportTicketInput, now: Date): ReportTicket {
  const messages = t.messages.filter((m) => m.direction === "incoming" || m.direction === "outgoing").sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  const firstCustomer = messages.find((m) => m.direction === "incoming");
  const start = firstCustomer?.receivedAt ?? t.createdAt;
  const notCustomer = t.status === "no_reply";
  const open = !isClosed(t.ticketStatus) && !notCustomer;

  let first: ReportMessage | undefined;
  let waitingSince: Date | null = null;
  const replies: ReportTicket["replies"] = [];
  for (const m of messages) {
    if (m.receivedAt < start) continue;
    if (!first) {
      if (m.direction === "outgoing") first = m;
      continue;
    }
    if (m.direction === "incoming") waitingSince ??= m.receivedAt;
    else if (waitingSince) {
      replies.push({ hours: round(businessHoursBetween(waitingSince, m.receivedAt)), responder: responderOf(m) });
      waitingSince = null;
    }
  }

  const firstResponseHours = first ? round(businessHoursBetween(start, first.receivedAt)) : null;
  const waitingFor = !open ? null : !first ? "first_response" : waitingSince ? "reply" : null;
  const waitingHours = waitingFor ? round(businessHoursBetween(waitingFor === "reply" ? waitingSince! : start, now)) : null;
  const late = (h: number | null) => h !== null && h > SLA_BUSINESS_HOURS;
  const measured = !notCustomer && (first || waitingFor);
  const slaMet = measured ? !late(firstResponseHours) && !replies.some((r) => late(r.hours)) && !late(waitingHours) : null;

  return {
    id: t.id, ticketNumber: t.ticketNumber, subject: t.subject, tier: t.tier, ticketStatus: t.ticketStatus, product: t.product, notCustomer,
    createdAt: t.createdAt.toISOString(),
    firstResponseAt: first?.receivedAt.toISOString() ?? null,
    firstResponder: first ? responderOf(first) : null,
    firstResponseHours,
    replies,
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    resolutionHours: t.resolvedAt ? round(businessHoursBetween(start, t.resolvedAt)) : null,
    waitingHours, waitingFor, slaMet,
  };
}

export function buildSupportReport(input: ReportTicketInput[], now: Date): SupportReport {
  const tickets = input.map((t) => reportTicket(t, now));
  const customers = tickets.filter((t) => !t.notCustomer);
  const byStatus: Record<string, number> = {};
  for (const t of tickets) byStatus[t.ticketStatus] = (byStatus[t.ticketStatus] ?? 0) + 1;

  const firstHours = (list: ReportTicket[], who?: Responder) => list.filter((t) => t.firstResponseHours !== null && (!who || t.firstResponder === who)).map((t) => t.firstResponseHours!);
  const replyHours = (who?: Responder) => customers.flatMap((t) => t.replies).filter((r) => !who || r.responder === who).map((r) => r.hours);
  const breached = (t: ReportTicket) => t.waitingHours !== null && t.waitingHours > SLA_BUSINESS_HOURS;

  const firstAll = stats(firstHours(customers));
  const firstWaiting = customers.filter((t) => t.waitingFor === "first_response");
  const firstLate = firstWaiting.filter(breached).length;
  const replyAll = stats(replyHours());
  const replyWaiting = customers.filter((t) => t.waitingFor === "reply");
  const replyLate = replyWaiting.filter(breached).length;
  const resolutionHours = customers.filter((t) => t.resolutionHours !== null).map((t) => t.resolutionHours!);

  const group = (key: (t: ReportTicket) => string) => {
    const map = new Map<string, ReportTicket[]>();
    for (const t of customers) map.set(key(t), [...(map.get(key(t)) ?? []), t]);
    return map;
  };
  const slaRate = (list: ReportTicket[]) => rate(list.filter((t) => t.slaMet).length, list.filter((t) => t.slaMet !== null).length);

  return {
    slaHours: SLA_BUSINESS_HOURS,
    totals: {
      tickets: tickets.length,
      customers: customers.length,
      notCustomer: tickets.length - customers.length,
      resolved: customers.filter((t) => t.ticketStatus === "resolved").length,
      closed: customers.filter((t) => t.ticketStatus === "closed").length,
      open: customers.filter((t) => !isClosed(t.ticketStatus)).length,
    },
    byStatus,
    firstResponse: { ...firstAll, ai: stats(firstHours(customers, "ai")), human: stats(firstHours(customers, "human")), waiting: firstWaiting.length, waitingBreached: firstLate, slaRate: rate(firstAll.withinSla, firstAll.count + firstLate) },
    replies: { ...replyAll, ai: stats(replyHours("ai")), human: stats(replyHours("human")), waiting: replyWaiting.length, waitingBreached: replyLate, slaRate: rate(replyAll.withinSla, replyAll.count + replyLate) },
    resolution: { count: resolutionHours.length, median: median(resolutionHours), average: stats(resolutionHours).average },
    byTier: [...group((t) => t.tier)].sort(([a], [b]) => a.localeCompare(b)).map(([tier, list]) => ({ tier, tickets: list.length, firstResponseMedian: median(firstHours(list)), slaRate: slaRate(list) })),
    byProduct: [...group((t) => t.product ?? "No order on file")].map(([product, list]) => ({ product, tickets: list.length, slaRate: slaRate(list) })).sort((a, b) => b.tickets - a.tickets),
    breaches: customers.filter(breached).sort((a, b) => b.waitingHours! - a.waitingHours!),
    tickets,
  };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Leading =+-@ would run as a formula in Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** One row per ticket. No customer contact data: the ticket number is the lookup key. */
export function supportReportCsv(tickets: ReportTicket[]): string {
  const header = ["Ticket", "Created", "Tier", "Status", "Product", "Not a customer", "First response at", "First responder", "First response (business h)", "Replies", "Slowest reply (business h)", "Resolved at", "Resolution (business h)", "Waiting for", "Waiting (business h)", "Within SLA"];
  const rows = tickets.map((t) => [
    t.ticketNumber, t.createdAt, t.tier, t.ticketStatus, t.product, t.notCustomer ? "yes" : "no", t.firstResponseAt, t.firstResponder === "ai" ? "AI" : t.firstResponder === "human" ? "Staff" : "", t.firstResponseHours,
    t.replies.length, t.replies.length ? Math.max(...t.replies.map((r) => r.hours)) : "", t.resolvedAt, t.resolutionHours, t.waitingFor?.replace("_", " ") ?? "", t.waitingHours, t.slaMet === null ? "" : t.slaMet ? "yes" : "no",
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
