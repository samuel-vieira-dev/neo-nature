/**
 * Universal tracking link for a BuyGoods shipping_tracking_id. We don't have
 * a carrier API integration (AfterShip/EasyPost) yet, so this defers carrier
 * detection to 17TRACK's public lookup — works for USPS, GlobalPost, and most
 * international carriers without us maintaining a prefix→carrier table.
 */
export function buildTrackingUrl(trackingId: string): string {
  return `https://t.17track.net/en#nums=${encodeURIComponent(trackingId)}`;
}
