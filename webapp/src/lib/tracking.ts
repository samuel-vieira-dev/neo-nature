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
