/**
 * Lists every country the brand has actually shipped orders to — the list to
 * enable under Twilio's SMS Geographic Permissions, so login codes are not
 * refused with error 21408 ("Permission to send an SMS has not been enabled
 * for the region indicated by the 'To' number").
 *
 * Two independent sources, merged:
 *   • the raw IPN capture (webhook_logs): shipping_country / country_2letter /
 *     customer_country — what the checkout actually recorded;
 *   • orders.address, whose last segment is the shipping country (the fallback
 *     for rows whose log was pruned, and for the Konnektive feed).
 *
 * Also reports the dial code of the phone customers left, since that — not the
 * shipping address — is where the login SMS goes (a UK expat buying with a US
 * number needs +1 enabled, not +44).
 *
 * Read-only. Usage:
 *   npx tsx --env-file=.env.production scripts/sales-countries.ts
 *   npx tsx --env-file=.env.production scripts/sales-countries.ts --csv
 */
import { rawSql } from "../src/db";
import { parseIpnParams } from "../src/server/buygoods";
import { resolveCountry, flagEmoji, countryOptions } from "../src/lib/phone-format";

const csv = process.argv.includes("--csv");

type Row = { address: string; phone: string | null; source: string; bg: string | null };

const NAMES = new Map(countryOptions().map((c) => [c.iso, c.name] as const));
const DIAL_TO_COUNTRIES = new Map<string, string[]>();
for (const c of countryOptions()) {
  const list = DIAL_TO_COUNTRIES.get(c.dial) ?? [];
  list.push(c.iso);
  DIAL_TO_COUNTRIES.set(c.dial, list);
}

/** Longest dial code that prefixes this E.164 number (dial codes are 1–4 digits). */
function dialOf(phoneE164: string): string | null {
  for (let len = 4; len >= 1; len--) {
    const candidate = phoneE164.slice(0, 1 + len);
    if (DIAL_TO_COUNTRIES.has(candidate)) return candidate;
  }
  return null;
}

async function main() {
  // 1. shipping country per order, from the raw IPN when available
  const logs = (await rawSql`
    select body, query from webhook_logs
    where source = 'buygoods' and (body ilike '%shipping_country%' or body ilike '%country_2letter%')
    order by received_at
  `) as unknown as { body: string; query: Record<string, string> }[];

  const countryByOrder = new Map<string, string>();
  for (const log of logs) {
    const p = parseIpnParams(log.query ?? {}, String(log.body ?? ""));
    const bgId = p.order_id_global?.trim();
    if (!bgId) continue;
    const iso = resolveCountry(p.country_2letter) ?? resolveCountry(p.shipping_country) ?? resolveCountry(p.customer_country);
    if (iso) countryByOrder.set(bgId, iso);
  }

  // 2. every order, with the address fallback
  const rows = (await rawSql`
    select address, customer_phone_e164 as phone, source, buygoods_order_id as bg
    from orders
  `) as unknown as Row[];

  const byShipping = new Map<string, number>();
  const byPhone = new Map<string, number>();
  let unknownShipping = 0;
  let noPhone = 0;
  const unknownSamples = new Set<string>();

  for (const o of rows) {
    const fromLog = o.bg ? countryByOrder.get(o.bg) : undefined;
    const lastSegment = o.address?.split(",").map((s) => s.trim()).filter(Boolean).at(-1) ?? null;
    const iso = fromLog ?? resolveCountry(lastSegment);
    if (iso) byShipping.set(iso, (byShipping.get(iso) ?? 0) + 1);
    else {
      unknownShipping++;
      if (lastSegment) unknownSamples.add(lastSegment);
    }

    if (!o.phone) noPhone++;
    else {
      const dial = dialOf(o.phone);
      if (dial) byPhone.set(dial, (byPhone.get(dial) ?? 0) + 1);
    }
  }

  const shipping = [...byShipping.entries()].sort((a, b) => b[1] - a[1]);

  if (csv) {
    console.log("iso,country,orders");
    for (const [iso, n] of shipping) console.log(`${iso},"${NAMES.get(iso as never) ?? iso}",${n}`);
    await rawSql.end();
    return;
  }

  console.log(`${rows.length} orders · ${shipping.length} destination countries\n`);
  console.log("SHIPPING COUNTRY (where the product went)");
  console.log("iso  country                          orders");
  for (const [iso, n] of shipping) {
    console.log(`${flagEmoji(iso)} ${iso}  ${(NAMES.get(iso as never) ?? iso).padEnd(30)} ${String(n).padStart(6)}`);
  }
  if (unknownShipping) {
    console.log(`\n(${unknownShipping} order(s) with no recognizable country${unknownSamples.size ? `; unparsed values: ${[...unknownSamples].slice(0, 8).join(" | ")}` : ""})`);
  }

  console.log("\n\nPHONE DIAL CODE (where the login SMS is actually sent)");
  console.log("dial   countries sharing it                              orders");
  for (const [dial, n] of [...byPhone.entries()].sort((a, b) => b[1] - a[1])) {
    const isos = DIAL_TO_COUNTRIES.get(dial) ?? [];
    const label = isos.length > 6 ? `${isos.slice(0, 6).join(",")} +${isos.length - 6} more` : isos.join(",");
    console.log(`${dial.padEnd(6)} ${label.padEnd(48)} ${String(n).padStart(6)}`);
  }
  if (noPhone) console.log(`\n(${noPhone} order(s) without a usable phone number)`);

  // The list to enable in Twilio: the union of both, since either can be the
  // destination of a login code.
  const enable = new Set<string>(byShipping.keys());
  for (const dial of byPhone.keys()) for (const iso of DIAL_TO_COUNTRIES.get(dial) ?? []) enable.add(iso);
  const sorted = [...enable].sort((a, b) => (NAMES.get(a as never) ?? a).localeCompare(NAMES.get(b as never) ?? b, "en"));
  console.log(`\n\nENABLE THESE ${sorted.length} COUNTRIES IN TWILIO GEO PERMISSIONS`);
  console.log("(shipping destinations + every country sharing a dial code with a customer's phone)\n");
  console.log(sorted.map((iso) => `${NAMES.get(iso as never) ?? iso} (${iso})`).join("\n"));

  await rawSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
