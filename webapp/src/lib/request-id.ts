"use client";

import { useRef } from "react";

const mint = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * Stable idempotency keys, one per *submission intent* — not per click.
 *
 * The returned function mints an id the first time an action key is asked for
 * and hands back that same id afterwards, so every retry of the same action
 * (an impatient second tap, a retry after a network blip) carries the key the
 * server dedupes on. Different actions on the same screen get different keys.
 */
export function useRequestIds() {
  const ids = useRef<Record<string, string>>({});
  return (action: string) => (ids.current[action] ??= mint());
}
