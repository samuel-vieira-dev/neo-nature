// ---------------------------------------------------------------------------
// Where a purchase was processed: the sales platform (BuyGoods, Konnektive,
// and whatever is plugged in next — JVZoo, ClickBank…) and, within it, the
// merchant account that took the money.
//
// This is NOT `orders.sale_origin`, which answers a different question — who
// SENT the traffic (affiliate / traffic source / funnel). A single BuyGoods
// merchant account runs many affiliates, and one affiliate can send traffic to
// several accounts, so the CRM shows both.
//
// Derived at read time from columns the feeds already fill (`source`,
// `buygoods_account_id`), so there is nothing to migrate or backfill and a new
// account shows up the moment its first order lands.
// ---------------------------------------------------------------------------

/** Platform label per `orders.source`. Add a row when a new feed is ingested. */
const PLATFORMS: Record<string, string> = {
  buygoods: "BuyGoods",
  konnektive: "Konnektive",
};

/**
 * Friendly names for the client's BuyGoods merchant accounts, annotated from
 * what each has actually sold (verified against production on 2026-08-25).
 * An unmapped account still renders — as "BuyGoods #12345" — so nothing is
 * hidden while this map catches up.
 */
const BUYGOODS_ACCOUNTS: Record<string, string> = {
  "11227": "Zensulin",
  "11020": "Neuro Sharp",
  "11829": "SlimForce",
  "9938": "NerveCalm",
  "11308": "HeroUp",
  "8872": "EliteXtreme",
};

export type PurchaseOrigin = {
  /** Stable filter key, e.g. "buygoods:11227" or "konnektive". */
  key: string;
  /** "BuyGoods" · "Konnektive" · … */
  platform: string;
  /** The merchant account inside that platform, when the feed identifies one. */
  account: string | null;
  /** What the admin reads: "BuyGoods · Zensulin" / "BuyGoods #8872" / "Konnektive". */
  label: string;
};

export function purchaseOriginOf(o: { source: string; buygoodsAccountId?: string | null }): PurchaseOrigin {
  const platform = PLATFORMS[o.source] ?? o.source;
  const acctId = o.source === "buygoods" ? (o.buygoodsAccountId?.trim() || null) : null;

  if (!acctId) {
    // Konnektive's feed carries no merchant id, and some BuyGoods event shapes
    // drop account_id — both are honest "platform only" rows, never guesses.
    return { key: o.source, platform, account: null, label: platform };
  }

  const name = BUYGOODS_ACCOUNTS[acctId];
  return {
    key: `${o.source}:${acctId}`,
    platform,
    account: name ?? `#${acctId}`,
    label: name ? `${platform} · ${name}` : `${platform} #${acctId}`,
  };
}
