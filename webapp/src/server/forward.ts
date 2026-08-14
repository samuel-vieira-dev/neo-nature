// ---------------------------------------------------------------------------
// Fan-out of BuyGoods IPNs to the n8n "rastreio" webhooks.
//
// Every IPN carries the BuyGoods account it came from in `account_id`, and each
// account maps to one n8n endpoint (one per brand). We forward the payload
// byte-for-byte so n8n sees exactly what BuyGoods sent us — this app is just a
// tee, never a transformer.
//
// Failures here must never affect what we answer BuyGoods: the route calls this
// from `after()`, the response is already out, and every error is swallowed
// after being logged.
// ---------------------------------------------------------------------------

/** account_id -> n8n webhook. Override in prod with BUYGOODS_FORWARD_TARGETS. */
const DEFAULT_TARGETS: Record<string, string> = {
  "11308": "https://backn8n-neonature.digitalemaileld.com/webhook/bg-heroup-rastreio",
  "9938": "https://backn8n-neonature.digitalemaileld.com/webhook/bg-nervecalm-rastreio",
  "11020": "https://backn8n-neonature.digitalemaileld.com/webhook/bg-neurosharp-rastreio",
  "11829": "https://backn8n-neonature.digitalemaileld.com/webhook/bg-slimforce-rastreio",
  "11227": "https://backn8n-neonature.digitalemaileld.com/webhook/bg-zensulin-rastreio",
};

const TIMEOUT_MS = 10_000;
const ATTEMPTS = 3;

/**
 * Targets in effect. BUYGOODS_FORWARD_TARGETS ("11308=https://a,9938=https://b")
 * replaces the defaults entirely, so setting it to "" disables forwarding.
 */
export function forwardTargets(): Record<string, string> {
  const raw = process.env.BUYGOODS_FORWARD_TARGETS;
  if (raw === undefined) return DEFAULT_TARGETS;

  const targets: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const at = pair.indexOf("=");
    if (at <= 0) continue;
    const id = pair.slice(0, at).trim();
    const url = pair.slice(at + 1).trim();
    if (id && url) targets[id] = url;
  }
  return targets;
}

export type ForwardResult =
  | { ok: true; accountId: string; url: string; status: number; attempts: number }
  | { ok: false; reason: "no-account-id" | "no-target"; accountId: string | null }
  | { ok: false; reason: "failed"; accountId: string; url: string; error: string; attempts: number };

/**
 * Relays one IPN to the n8n webhook of its account. `rawBody` and `contentType`
 * are the ones BuyGoods sent; when the hit carried no body (BuyGoods also
 * duplicates the fields on the query string) we re-encode the parsed params so
 * n8n always receives a form-urlencoded POST.
 */
export async function forwardBuyGoodsEvent(
  params: Record<string, string>,
  rawBody: string,
  contentType: string | null
): Promise<ForwardResult> {
  const accountId = params.account_id?.trim() || null;
  if (!accountId) return { ok: false, reason: "no-account-id", accountId: null };

  const url = forwardTargets()[accountId];
  if (!url) return { ok: false, reason: "no-target", accountId };

  const body = rawBody || new URLSearchParams(params).toString();
  const type = (rawBody && contentType) || "application/x-www-form-urlencoded";

  let lastError = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": type, "x-forwarded-from": "neonature-webhook-buygoods-info" },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // n8n answers 200 on success; a 4xx/5xx is worth one more try (the
      // "webhook not registered" state while a workflow is being edited is
      // transient, and duplicates are cheaper than losing the event).
      if (res.ok) return { ok: true, accountId, url, status: res.status, attempts: attempt };
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 500 * attempt));
  }

  return { ok: false, reason: "failed", accountId, url, error: lastError, attempts: ATTEMPTS };
}
