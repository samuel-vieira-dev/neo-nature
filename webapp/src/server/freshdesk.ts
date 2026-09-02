// ---------------------------------------------------------------------------
// Freshdesk integration (push-only). The app creates tickets in Freshdesk via
// the REST v2 API; the customer follows the conversation over email. Freshdesk
// is the system of record — our tickets table is a local mirror for the app's
// "Your tickets" screen.
//
// Credential-gated: with FRESHDESK_DOMAIN + FRESHDESK_API_KEY set, tickets are
// pushed to Freshdesk. Without them (e.g. before the trial account exists), the
// app keeps working local-only — same graceful path as an API failure.
//
// Docs: https://developers.freshdesk.com/api/  (POST /api/v2/tickets)
// ---------------------------------------------------------------------------

export type TicketKind = "support" | "refund" | "billing";

// Freshdesk numeric enums (docs): Priority Low(1) Medium(2) High(3) Urgent(4)
const PRIORITY: Record<TicketKind, number> = {
  support: 1, // Low
  billing: 2, // Medium
  refund: 3, // High — money is involved
};

export type FreshdeskTicketInput = {
  // Everything we know about the requester goes over: agents need the email to
  // reply, the phone to call, and the name to greet. Freshdesk only *requires*
  // a name when the contact has to be created from a phone with no email.
  email?: string;
  phone?: string;
  name?: string;
  subject: string;
  description?: string;
  kind: TicketKind;
  orderNumber?: string;
};

/**
 * Builds the JSON body for POST /api/v2/tickets. Pure + unit-tested.
 *
 * We deliberately DON'T use custom_fields: those must be pre-created in the
 * target Freshdesk account with exact `cf_*` names, and sending an unknown one
 * returns 400. Order number goes into the description + a tag instead, which
 * works against any account (important for the sandbox-first rollout).
 */
export function buildTicketPayload(input: FreshdeskTicketInput) {
  const orderLine = input.orderNumber && input.orderNumber !== "—" ? `\n\nOrder: ${input.orderNumber}` : "";

  const contact: { email?: string; phone?: string; name?: string } = {};
  if (input.email) contact.email = input.email;
  if (input.phone) contact.phone = input.phone;
  if (input.name) contact.name = input.name;
  // Freshdesk rejects a phone-only requester without a name, so a placeholder
  // stands in — but only in that case, never over a name we actually have.
  else if (contact.phone && !contact.email) contact.name = "Neo Nature customer";

  return {
    ...contact,
    subject: input.subject,
    description: `${input.description?.trim() || input.subject}${orderLine}`,
    priority: PRIORITY[input.kind],
    status: 2, // Open
    tags: ["neonature-app", input.kind],
  };
}

export function isFreshdeskConfigured(): boolean {
  return !!process.env.FRESHDESK_DOMAIN && !!process.env.FRESHDESK_API_KEY;
}

// ------------------------- read-side (Customer 360) -------------------------

/** Live Freshdesk ticket, as shown on the admin customer page. */
export type FreshdeskTicket = {
  id: number;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  /** Deep link into the agent UI. */
  url: string;
};

// Freshdesk numeric enums (docs) → labels
const STATUS_LABELS: Record<number, string> = { 2: "Open", 3: "Pending", 4: "Resolved", 5: "Closed" };
const PRIORITY_LABELS: Record<number, string> = { 1: "Low", 2: "Medium", 3: "High", 4: "Urgent" };

/** Pure + unit-tested: list URL for one requester email. */
export function buildTicketListUrl(domain: string, email: string): string {
  return `https://${domain}.freshdesk.com/api/v2/tickets?email=${encodeURIComponent(email)}&order_by=updated_at&per_page=30`;
}

/** Pure + unit-tested: API rows → FreshdeskTicket[], tolerant of junk. */
export function parseTicketList(domain: string, data: unknown): FreshdeskTicket[] {
  if (!Array.isArray(data)) return [];
  const out: FreshdeskTicket[] = [];
  for (const row of data) {
    if (typeof row !== "object" || row === null) continue;
    const t = row as Record<string, unknown>;
    if (typeof t.id !== "number") continue;
    out.push({
      id: t.id,
      subject: typeof t.subject === "string" ? t.subject : "(no subject)",
      status: STATUS_LABELS[t.status as number] ?? String(t.status ?? "?"),
      priority: PRIORITY_LABELS[t.priority as number] ?? String(t.priority ?? "?"),
      createdAt: typeof t.created_at === "string" ? t.created_at : "",
      updatedAt: typeof t.updated_at === "string" ? t.updated_at : "",
      url: `https://${domain}.freshdesk.com/a/tickets/${t.id}`,
    });
  }
  return out;
}

/** Live Freshdesk ticket with the requester attached — only the recent-queue
 *  endpoint (below) fetches this; the per-customer lookup above already knows
 *  the email it searched for. */
export type FreshdeskTicketWithRequester = FreshdeskTicket & {
  requester: { name: string | null; email: string | null; phone: string | null };
};

/** Pure + unit-tested: like parseTicketList, but also reads requester.{name,email,phone}
 *  when the response was fetched with `include=requester`. */
export function parseTicketListWithRequester(domain: string, data: unknown): FreshdeskTicketWithRequester[] {
  if (!Array.isArray(data)) return [];
  const out: FreshdeskTicketWithRequester[] = [];
  for (const row of data) {
    if (typeof row !== "object" || row === null) continue;
    const t = row as Record<string, unknown>;
    if (typeof t.id !== "number") continue;
    const req = typeof t.requester === "object" && t.requester !== null ? (t.requester as Record<string, unknown>) : null;
    out.push({
      id: t.id,
      subject: typeof t.subject === "string" ? t.subject : "(no subject)",
      status: STATUS_LABELS[t.status as number] ?? String(t.status ?? "?"),
      priority: PRIORITY_LABELS[t.priority as number] ?? String(t.priority ?? "?"),
      createdAt: typeof t.created_at === "string" ? t.created_at : "",
      updatedAt: typeof t.updated_at === "string" ? t.updated_at : "",
      url: `https://${domain}.freshdesk.com/a/tickets/${t.id}`,
      requester: {
        name: req && typeof req.name === "string" ? req.name : null,
        email: req && typeof req.email === "string" ? req.email : null,
        phone: req && typeof req.phone === "string" ? req.phone : req && typeof req.mobile === "string" ? req.mobile : null,
      },
    });
  }
  return out;
}

export type FreshdeskListResult =
  | { ok: true; tickets: FreshdeskTicket[] }
  | { ok: false; reason: "not_configured" | "api_error"; detail?: string };

/**
 * Lists a customer's live tickets across every email we know for them.
 * Read-only, never throws, bounded by a 5s timeout per request — the customer
 * page must render even when Freshdesk is down.
 */
export async function listFreshdeskTickets(emails: string[]): Promise<FreshdeskListResult> {
  if (!isFreshdeskConfigured()) return { ok: false, reason: "not_configured" };
  const domain = process.env.FRESHDESK_DOMAIN!;
  const apiKey = process.env.FRESHDESK_API_KEY!;
  const auth = Buffer.from(`${apiKey}:X`).toString("base64");

  const byId = new Map<number, FreshdeskTicket>();
  try {
    for (const email of [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))]) {
      const res = await fetch(buildTicketListUrl(domain, email), {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error(`[freshdesk] list failed ${res.status}: ${detail.slice(0, 200)}`);
        return { ok: false, reason: "api_error", detail: `${res.status}` };
      }
      for (const t of parseTicketList(domain, await res.json())) byId.set(t.id, t);
    }
  } catch (e) {
    console.error("[freshdesk] list threw:", e);
    return { ok: false, reason: "api_error", detail: "network" };
  }

  return {
    ok: true,
    tickets: [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

export type FreshdeskRecentListResult =
  | { ok: true; tickets: FreshdeskTicketWithRequester[] }
  | { ok: false; reason: "not_configured" | "api_error"; detail?: string };

/**
 * Lists tickets updated in the last `sinceDays` days, across ALL requesters —
 * powers the support desk's unified ticket queue (src/server/support-desk.ts),
 * unlike listFreshdeskTickets above which is scoped to one customer's emails.
 * Paginates up to 3 pages (300 tickets) while a page comes back full (100
 * rows); bounded by a 5s timeout per request; never throws.
 */
export async function listRecentFreshdeskTickets({
  sinceDays = 90,
}: { sinceDays?: number } = {}): Promise<FreshdeskRecentListResult> {
  if (!isFreshdeskConfigured()) return { ok: false, reason: "not_configured" };
  const domain = process.env.FRESHDESK_DOMAIN!;
  const apiKey = process.env.FRESHDESK_API_KEY!;
  const auth = Buffer.from(`${apiKey}:X`).toString("base64");
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  const tickets: FreshdeskTicketWithRequester[] = [];
  try {
    for (let page = 1; page <= 3; page++) {
      const url = `https://${domain}.freshdesk.com/api/v2/tickets?include=requester&order_by=updated_at&per_page=100&updated_since=${encodeURIComponent(since)}&page=${page}`;
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error(`[freshdesk] recent list failed ${res.status}: ${detail.slice(0, 200)}`);
        return { ok: false, reason: "api_error", detail: `${res.status}` };
      }
      const pageTickets = parseTicketListWithRequester(domain, await res.json());
      tickets.push(...pageTickets);
      if (pageTickets.length < 100) break;
    }
  } catch (e) {
    console.error("[freshdesk] recent list threw:", e);
    return { ok: false, reason: "api_error", detail: "network" };
  }

  return { ok: true, tickets };
}

export type FreshdeskResult =
  | { ok: true; freshdeskId: number }
  | { ok: false; reason: "not_configured" | "api_error"; detail?: string };

/** Creates the ticket in Freshdesk. Never throws — returns a typed result. */
export async function createFreshdeskTicket(input: FreshdeskTicketInput): Promise<FreshdeskResult> {
  if (!isFreshdeskConfigured()) return { ok: false, reason: "not_configured" };

  const domain = process.env.FRESHDESK_DOMAIN!;
  const apiKey = process.env.FRESHDESK_API_KEY!;
  // Basic auth: API key as username, any string as password (docs use "X")
  const auth = Buffer.from(`${apiKey}:X`).toString("base64");

  const post = (body: object) =>
    fetch(`https://${domain}.freshdesk.com/api/v2/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify(body),
    });

  try {
    let res = await post(buildTicketPayload(input));

    // A phone that already belongs to another Freshdesk contact is rejected —
    // happens when an SMS-only customer later gets an email on their account.
    // The email alone still identifies them, so retry rather than lose the ticket.
    if (res.status === 400 && input.phone && input.email) {
      const detail = await res.text().catch(() => "");
      console.warn(`[freshdesk] retrying without phone after 400: ${detail.slice(0, 200)}`);
      res = await post(buildTicketPayload({ ...input, phone: undefined }));
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[freshdesk] create failed ${res.status}: ${detail.slice(0, 300)}`);
      return { ok: false, reason: "api_error", detail: `${res.status}` };
    }

    const data = (await res.json()) as { id?: number };
    if (typeof data.id !== "number") return { ok: false, reason: "api_error", detail: "no_id" };
    return { ok: true, freshdeskId: data.id };
  } catch (e) {
    console.error("[freshdesk] create threw:", e);
    return { ok: false, reason: "api_error", detail: "network" };
  }
}
