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
  email: string;
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
  return {
    email: input.email,
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

  try {
    const res = await fetch(`https://${domain}.freshdesk.com/api/v2/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify(buildTicketPayload(input)),
    });

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
