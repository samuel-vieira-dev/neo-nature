// ---------------------------------------------------------------------------
// Upsell / downsell folding.
//
// BuyGoods books every funnel step as its own order: the main product, then
// any upsell or downsell the customer accepted in the same checkout session —
// each with its own order_id_global, seconds to minutes apart, later shipped
// together under ONE tracking number. To the customer that is a single
// purchase, so the app shows one order with several items.
//
// Signals, from what production data shows (2026-08-21):
//   • flag_upsell=1 on the IPN (orders.upsell_flag) — the authoritative one;
//   • codename prefix "u…"/"d…" (u1_3zen6_3, d2_3burn6_3, uneuro6_3_294) —
//     fallback for rows ingested before the flag was stored, or feeds without it;
//   • the same customer can check out twice an hour apart (different BuyGoods
//     user_id each time), so an add-on attaches to the CLOSEST main order of
//     the same (account_id, user_id) pair, never just "anything within N hours";
//   • a shared shipping_tracking_id folds rows regardless of the above.
//
// Pure functions over already-loaded rows (no DB) so the rule is unit-tested
// against the shapes we see in production. The CRM/admin keeps the raw rows.
// ---------------------------------------------------------------------------

import type { Order } from "@/db/schema";

/** How far (in ms) an add-on may sit from its main order and still be folded in. */
export const ADDON_WINDOW_MS = 4 * 60 * 60 * 1000;

export type OrderStatus = "confirmed" | "shipped" | "canceled" | "refunded";

export type GroupableOrder = Pick<
  Order,
  "id" | "placedAt" | "productCodename" | "shippingTrackingId" | "status" | "upsellFlag" | "buygoodsAccountId" | "buygoodsUserId"
>;

/** BuyGoods upsell/downsell codenames start with "u"/"d" ("u1_3zen6_3", "d2_3burn6_3", "uneuro6_3_294"). */
export function isAddOnCodename(codename: string | null | undefined): boolean {
  return /^[ud]/i.test((codename ?? "").trim());
}

/** Upsell/downsell row: the feed's flag when we have it, the codename prefix otherwise. */
export function isAddOn(o: Pick<GroupableOrder, "upsellFlag" | "productCodename">): boolean {
  return o.upsellFlag === true || isAddOnCodename(o.productCodename);
}

export type OrderGroup<T extends GroupableOrder = Order> = {
  /** The order the customer sees: the main (non add-on) order, or the earliest. */
  anchor: T;
  /** Every folded order, anchor included, oldest first. */
  members: T[];
};

function sameTracking(a: GroupableOrder, b: GroupableOrder): boolean {
  return !!a.shippingTrackingId && a.shippingTrackingId.trim() === (b.shippingTrackingId ?? "").trim();
}

function withinWindow(a: GroupableOrder, b: GroupableOrder): boolean {
  return Math.abs(a.placedAt.getTime() - b.placedAt.getTime()) <= ADDON_WINDOW_MS;
}

/**
 * BuyGoods' (account_id, user_id) pair is minted per checkout session, so two
 * orders from different pairs are different sessions even if minutes apart.
 * Unknown on either side → can't tell → don't block.
 */
function sameSession(a: GroupableOrder, b: GroupableOrder): boolean {
  if (!a.buygoodsAccountId || !a.buygoodsUserId || !b.buygoodsAccountId || !b.buygoodsUserId) return true;
  return a.buygoodsAccountId === b.buygoodsAccountId && a.buygoodsUserId === b.buygoodsUserId;
}

/**
 * Folds one customer's orders into purchase groups. Assumes the input is
 * already scoped to a single customer (the signed-in user's orders).
 */
export function groupOrders<T extends GroupableOrder>(rows: T[]): OrderGroup<T>[] {
  const sorted = [...rows].sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());
  const groups: { members: T[] }[] = [];

  const distance = (g: { members: T[] }, o: T) =>
    Math.min(...g.members.map((m) => Math.abs(m.placedAt.getTime() - o.placedAt.getTime())));

  for (const o of sorted) {
    // 1. Shipped under the same tracking number → same parcel, same purchase.
    let home = groups.find((g) => g.members.some((m) => sameTracking(m, o)));

    if (!home && isAddOn(o)) {
      // 2. An add-on joins the closest purchase of the same checkout session
      //    within the window (closest, because a customer can buy twice in an
      //    evening and each session has its own upsell tail).
      const candidates = groups.filter((g) => g.members.some((m) => withinWindow(m, o) && sameSession(m, o)));
      home = candidates.sort((a, b) => distance(a, o) - distance(b, o))[0];
    } else if (!home) {
      // 3. A main order never joins another purchase by time alone, but it
      //    adopts add-on-only groups that landed just before it (the feed can
      //    stamp the upsell a second ahead of the sale that spawned it).
      const orphans = groups.filter(
        (g) => g.members.every((m) => isAddOn(m)) && g.members.some((m) => withinWindow(m, o) && sameSession(m, o))
      );
      if (orphans.length) {
        const merged = { members: [...orphans.flatMap((g) => g.members), o].sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime()) };
        for (const g of orphans) groups.splice(groups.indexOf(g), 1);
        groups.push(merged);
        continue;
      }
    }

    if (home) home.members.push(o);
    else groups.push({ members: [o] });
  }

  return groups.map(({ members }) => ({
    anchor: members.find((m) => !isAddOn(m)) ?? members[0],
    members,
  }));
}

/**
 * The group's customer-facing status. Add-ons can be refunded/canceled on
 * their own (a customer returns just the upsell) without changing what
 * happened to the main order, so the anchor decides — unless the anchor itself
 * ended and a sibling is still live, in which case the live one wins.
 */
export function groupStatus(group: OrderGroup<GroupableOrder>): OrderStatus {
  const anchorStatus = group.anchor.status as OrderStatus;
  if (anchorStatus === "confirmed" || anchorStatus === "shipped") return anchorStatus;
  const live = group.members.find((m) => m.status === "shipped") ?? group.members.find((m) => m.status === "confirmed");
  return (live?.status as OrderStatus) ?? anchorStatus;
}

/** Sum of what the customer was charged across the folded orders (canceled ones never charged). */
export function groupTotal(group: OrderGroup<GroupableOrder & { total: string }>): number {
  return group.members
    .filter((m) => m.status !== "canceled")
    .reduce((sum, m) => sum + Number(m.total), 0);
}

/** First non-empty tracking number in the group (the anchor's, when it has one). */
export function groupTrackingId(group: OrderGroup<GroupableOrder>): string | null {
  return (
    group.anchor.shippingTrackingId?.trim() ||
    group.members.map((m) => m.shippingTrackingId?.trim()).find((t) => !!t) ||
    null
  );
}
