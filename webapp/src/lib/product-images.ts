// ---------------------------------------------------------------------------
// Single-bottle packshots (public/products/*.png, transparent background) for
// the compact order line — one clean unit of the product instead of the
// feed's multi-bottle offer image. Matched by product family, since one
// product ships under many BuyGoods codenames (zen6, u1_3zen6_3, zen3_new …)
// and names ("Zensulin 6 Bottles", "Zensulin 6+3 FREE").
//
// Products without a mockup yet return null — callers fall back to the feed
// thumbnail. Drop a new PNG in public/products and add a row here to cover
// another product.
// ---------------------------------------------------------------------------

const FAMILIES: { url: string; codename: RegExp; name: RegExp }[] = [
  { url: "/products/zensulin.png", codename: /zen/i, name: /zensulin/i },
  { url: "/products/neuro-sharp.png", codename: /neu/i, name: /neuro\s*sharp/i },
  { url: "/products/heroup.png", codename: /her(o|\d)/i, name: /hero\s*up/i },
  { url: "/products/burn-boost.png", codename: /burn/i, name: /burn\s*boost/i },
  { url: "/products/blood-balance.png", codename: /blood/i, name: /blood\s*balance/i },
];

/** Path of the single-unit packshot for this product, or null when we have none. */
export function productImageFor(codename: string | null | undefined, name: string | null | undefined): string | null {
  const c = (codename ?? "").trim();
  const n = (name ?? "").trim();
  for (const f of FAMILIES) {
    // Codenames are compact ("u2_3zen6_3") so the family fragment is reliable;
    // names are the fallback for feeds with numeric ids (Konnektive).
    if ((c && f.codename.test(c)) || (n && f.name.test(n))) return f.url;
  }
  return null;
}
