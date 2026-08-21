/**
 * Customer-facing tracking link for a BuyGoods shipping_tracking_id.
 *
 * Defaults to 17TRACK's free public lookup, which detects the carrier from the
 * number's format — no account or API needed. Once the brand's own 17TRACK
 * tracking page exists, set TRACKING_URL_TEMPLATE to its URL with a {code}
 * placeholder (e.g. "https://neonature.17track.net/en?nums={code}") and the
 * app switches over with no deploy. Kept as config rather than a code change
 * because the page URL only exists after the account is set up.
 */
export function buildTrackingUrl(trackingId: string): string {
  const code = encodeURIComponent(trackingId);
  const template = process.env.TRACKING_URL_TEMPLATE?.trim();
  if (template?.includes("{code}")) return template.replace("{code}", code);
  return `https://t.17track.net/en#nums=${code}`;
}

const ACRONYMS = new Set(["dhl", "us", "usa", "usps", "ups", "fedex"]);

/**
 * Carrier/fulfillment feeds send SCREAMING_SNAKE_CASE status codes
 * ("PENDING_SHIPMENT", "EN ROUTE TO DHL ECOMMERCE DISTRIBUTION CENTER"). This
 * turns them into normal sentence case for display, without touching text
 * that's already human-written (has lowercase letters).
 */
export function humanizeStatus(raw: string | null | undefined): string {
  if (!raw) return "";
  // BuyGoods renders an unset fulfillment date as "Shipped on 29 Nov, -0001".
  if (/-0001\b/.test(raw)) return raw.replace(/\s+on\s+.*-0001.*$/i, "").trim() || "Shipped";
  if (/[a-z]/.test(raw)) return raw;
  const words = raw.replace(/_/g, " ").toLowerCase().split(/\s+/);
  return words
    .map((w, i) => (ACRONYMS.has(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}
