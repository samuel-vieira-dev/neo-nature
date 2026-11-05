import { describe, expect, it } from "vitest";
import { buildSupportReport, reportTicket, supportReportCsv, type ReportTicketInput } from "./support-report";

const now = new Date("2026-11-06T15:00:00Z"); // Friday 10 am Eastern
const msg = (direction: string, iso: string, staff = false) => ({ direction, authorAdminId: staff ? "admin-1" : null, receivedAt: new Date(iso) });
const ticket = (over: Partial<ReportTicketInput>): ReportTicketInput => ({
  id: "t1", ticketNumber: 1001, subject: "Where is my order?", tier: "T1", ticketStatus: "pending", status: "replied",
  createdAt: new Date("2026-11-02T14:00:00Z"), resolvedAt: null, product: "Sleep", messages: [], ...over,
});

describe("support report rules", () => {
  it("measures the first response from the customer's first message, AI vs staff", () => {
    const t = reportTicket(ticket({ messages: [msg("incoming", "2026-11-02T14:00:00Z"), msg("outgoing", "2026-11-02T14:30:00Z")] }), now);
    expect(t).toMatchObject({ firstResponseHours: 0.5, firstResponder: "ai", slaMet: true, waitingFor: null });
  });

  it("times each later reply from the first unanswered customer message", () => {
    const t = reportTicket(ticket({ tier: "T2", messages: [
      msg("incoming", "2026-11-02T14:00:00Z"), msg("outgoing", "2026-11-02T15:00:00Z"),
      msg("incoming", "2026-11-03T14:00:00Z"), msg("incoming", "2026-11-03T16:00:00Z"), msg("outgoing", "2026-11-05T14:00:00Z", true),
    ] }), now);
    expect(t.replies).toEqual([{ hours: 48, responder: "human" }]);
    expect(t.slaMet).toBe(false);
  });

  it("flags a ticket still waiting past 24 business hours", () => {
    const t = reportTicket(ticket({ ticketStatus: "open", messages: [msg("incoming", "2026-11-04T15:00:00Z")] }), now);
    expect(t).toMatchObject({ waitingFor: "first_response", waitingHours: 48, slaMet: false });
  });

  it("does not count resolved tickets as waiting, and records resolution time", () => {
    const t = reportTicket(ticket({ ticketStatus: "resolved", resolvedAt: new Date("2026-11-03T14:00:00Z"), messages: [msg("incoming", "2026-11-02T14:00:00Z"), msg("outgoing", "2026-11-02T15:00:00Z"), msg("incoming", "2026-11-02T16:00:00Z")] }), now);
    expect(t).toMatchObject({ waitingFor: null, waitingHours: null, resolutionHours: 24 });
  });

  it("keeps not-a-customer tickets out of the SLA numbers", () => {
    const report = buildSupportReport([
      ticket({ id: "spam", status: "no_reply", ticketStatus: "closed", messages: [msg("incoming", "2026-11-02T14:00:00Z")] }),
      ticket({ id: "late", ticketStatus: "open", messages: [msg("incoming", "2026-11-04T15:00:00Z")] }),
      ticket({ id: "fast", messages: [msg("incoming", "2026-11-02T14:00:00Z"), msg("outgoing", "2026-11-02T14:30:00Z")] }),
    ], now);
    expect(report.totals).toMatchObject({ tickets: 3, customers: 2, notCustomer: 1, open: 2 });
    expect(report.firstResponse).toMatchObject({ count: 1, withinSla: 1, waiting: 1, waitingBreached: 1, slaRate: 50 });
    expect(report.breaches.map((t) => t.id)).toEqual(["late"]);
    expect(report.byProduct).toEqual([{ product: "Sleep", tickets: 2, slaRate: 50 }]);
  });

  it("exports CSV without contact data and neutralises spreadsheet formulas", () => {
    const csv = supportReportCsv([reportTicket(ticket({ subject: "x", product: "=HYPERLINK(1)" }), now)]);
    expect(csv.split("\r\n")[1]).toContain("'=HYPERLINK(1)");
    expect(csv).not.toContain("@");
  });
});
