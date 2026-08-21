// ---------------------------------------------------------------------------
// Shared phone-number normalization (client + server). Customers sign in with
// a phone number (SMS OTP) — this is the single place that turns "whatever the
// user typed" / "whatever BuyGoods or Konnektive sent" into E.164.
//
// Orders ship worldwide, so parsing goes through libphonenumber: it knows every
// country's dial code, trunk prefix and number lengths. The textbook failure
// this fixes: a UK customer types "07713 480000" (local format with the trunk
// "0"); the old code glued "+44" in front and produced "+4407713480000", which
// Twilio rejects (error 21612). libphonenumber drops the trunk 0 → +447713480000.
// ---------------------------------------------------------------------------

// "core" + explicit metadata instead of the "min" entry: the min bundle's CJS
// build requires its JSON through an interop shim that breaks under tsx
// (scripts/*.ts run that way), while core + an imported metadata object
// works identically in Next, vitest and tsx.
import {
  parsePhoneNumberFromString as parseWithMeta,
  getCountries as getCountriesWithMeta,
  getCountryCallingCode as getCallingCodeWithMeta,
  type CountryCode,
  type MetadataJson,
} from "libphonenumber-js/core";
import metadataJson from "libphonenumber-js/min/metadata";

export type { CountryCode };

const metadata = metadataJson as MetadataJson;
const parsePhoneNumberFromString = (text: string, country?: CountryCode) =>
  country ? parseWithMeta(text, country, metadata) : parseWithMeta(text, metadata);
const getCountries = () => getCountriesWithMeta(metadata);
const getCountryCallingCode = (iso: CountryCode) => getCallingCodeWithMeta(iso, metadata);

/** Loose E.164 check: "+" followed by 8–15 digits, first digit 1–9. */
export function isValidE164(s: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(s);
}

const ALL_COUNTRIES: ReadonlySet<string> = new Set(getCountries());

/** Common non-ISO spellings BuyGoods/Konnektive/customers use for a country. */
const COUNTRY_ALIASES: Record<string, CountryCode> = {
  UK: "GB",
  "GREAT BRITAIN": "GB",
  ENGLAND: "GB",
  SCOTLAND: "GB",
  WALES: "GB",
  "NORTHERN IRELAND": "GB",
  USA: "US",
  "U.S.": "US",
  "U.S.A.": "US",
  "UNITED STATES OF AMERICA": "US",
  "UNITED STATES": "US",
  AMERICA: "US",
  UAE: "AE",
  "UNITED ARAB EMIRATES": "AE",
  "SOUTH KOREA": "KR",
  "KOREA, REPUBLIC OF": "KR",
  "REPUBLIC OF KOREA": "KR",
  RUSSIA: "RU",
  "RUSSIAN FEDERATION": "RU",
  VIETNAM: "VN",
  "VIET NAM": "VN",
  "CZECH REPUBLIC": "CZ",
  CZECHIA: "CZ",
  HOLLAND: "NL",
  "THE NETHERLANDS": "NL",
  BRASIL: "BR",
  MÉXICO: "MX",
  MEJICO: "MX",
  DEUTSCHLAND: "DE",
  ESPAÑA: "ES",
  ITALIA: "IT",
  TAIWAN: "TW",
  "HONG KONG SAR": "HK",
  "MACAO": "MO",
  IVORY_COAST: "CI",
  "IVORY COAST": "CI",
  "COTE D'IVOIRE": "CI",
  "CÔTE D'IVOIRE": "CI",
  "NEW ZEALAND": "NZ",
  "PUERTO RICO": "PR",
  "SOUTH AFRICA": "ZA",
  "SAUDI ARABIA": "SA",
  "DOMINICAN REPUBLIC": "DO",
  "COSTA RICA": "CR",
  "EL SALVADOR": "SV",
  "TRINIDAD AND TOBAGO": "TT",
  "TRINIDAD & TOBAGO": "TT",
  TURKEY: "TR",
  TÜRKIYE: "TR",
  BURMA: "MM",
  MACAU: "MO",
  SWAZILAND: "SZ",
  "EAST TIMOR": "TL",
  MOLDAVIA: "MD",
  BELORUSSIA: "BY",
  "THE BAHAMAS": "BS",
  "THE GAMBIA": "GM",
  "CONGO": "CG",
  "DR CONGO": "CD",
  DRC: "CD",
  "DEMOCRATIC REPUBLIC OF THE CONGO": "CD",
  "REPUBLIC OF THE CONGO": "CG",
  "SAINT LUCIA": "LC",
  "SAINT KITTS AND NEVIS": "KN",
  "SAINT VINCENT AND THE GRENADINES": "VC",
  "ANTIGUA AND BARBUDA": "AG",
  "BOSNIA AND HERZEGOVINA": "BA",
  "SAO TOME AND PRINCIPE": "ST",
  "CAPE VERDE": "CV",
  "CABO VERDE": "CV",
  MACEDONIA: "MK",
  "NORTH MACEDONIA": "MK",
  "UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND": "GB",
};

let nameIndex: Map<string, CountryCode> | null = null;

/** English country name → ISO code, built lazily from Intl (full ICU in Node/browsers). */
function countryNameIndex(): Map<string, CountryCode> {
  if (nameIndex) return nameIndex;
  nameIndex = new Map();
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    for (const iso of getCountries()) {
      const name = dn.of(iso);
      if (name) nameIndex.set(name.toUpperCase(), iso);
    }
  } catch {
    // Intl.DisplayNames unavailable — ISO codes + aliases still work.
  }
  for (const [alias, iso] of Object.entries(COUNTRY_ALIASES)) nameIndex.set(alias, iso);
  return nameIndex;
}

/**
 * Turns whatever a feed calls a country ("US", "us", "UK", "United Kingdom",
 * "Brasil") into an ISO-3166 alpha-2 code libphonenumber understands.
 * Returns undefined when it can't tell.
 */
export function resolveCountry(hint: string | null | undefined): CountryCode | undefined {
  if (!hint) return undefined;
  const key = hint.trim().toUpperCase().replace(/\s+/g, " ");
  if (!key) return undefined;
  if (key.length === 2 && ALL_COUNTRIES.has(key)) return key as CountryCode;
  return countryNameIndex().get(key);
}

/**
 * Combines the country the customer picked in the login form (ISO code, e.g.
 * "GB") with the locally-typed number into E.164. Handles trunk prefixes
 * ("07713…" in the UK, "0" in most of Europe), separators, and people who
 * type the full international number anyway ("+44 …" / "0044 …").
 * Returns null when the result isn't a plausible phone number.
 */
export function normalizePhone(country: string, local: string): string | null {
  const iso = resolveCountry(country);
  const input = local.trim().replace(/^00/, "+");
  // Typed the dial code without "+" while the matching country is selected —
  // e.g. "44 7713 480000" with UK picked. Treat it as international.
  if (iso && !input.startsWith("+")) {
    const dial = getCountryCallingCode(iso);
    const digits = input.replace(/\D/g, "");
    if (digits.startsWith(dial) && digits.length > dial.length + 6) {
      const asIntl = parsePhoneNumberFromString(`+${digits}`);
      if (asIntl?.isPossible()) return asIntl.number;
    }
  }
  if (!iso && !input.startsWith("+")) return null;
  const parsed = parsePhoneNumberFromString(input, iso);
  if (!parsed || !parsed.isPossible()) return null;
  // The picked country must agree with the number when the user typed "+…"
  // with a different dial code — fine, trust what they typed.
  return isValidE164(parsed.number) ? parsed.number : null;
}

/**
 * Best-effort E.164 for phone numbers arriving from an order feed (BuyGoods
 * IPN / Konnektive). Pass the order's shipping country when the feed has one:
 * international customers type local formats ("07713 480000") that are only
 * parseable with that context. Without a hint the checkout is assumed
 * US-centric (a bare 10-digit number is +1), as before.
 * Returns null when the input can't be turned into a valid E.164 number.
 */
export function normalizeIngestPhone(raw: string | null | undefined, countryHint?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^00(?=\d)/, "+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  // Explicit international format wins regardless of any hint.
  if (trimmed.startsWith("+")) {
    const p = parsePhoneNumberFromString(trimmed);
    if (p?.isPossible() && isValidE164(p.number)) return p.number;
  }

  const iso = resolveCountry(countryHint);
  if (iso) {
    const p = parsePhoneNumberFromString(trimmed, iso);
    if (p?.isPossible() && isValidE164(p.number)) return p.number;
  }

  // Legacy US-centric fallback (pre-hint behavior, kept so existing links
  // don't change): 10 digits → +1, 11 digits starting with 1 → +1…
  let candidate: string;
  if (digits.length === 10) candidate = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) candidate = `+${digits}`;
  else candidate = `+${digits}`;

  return isValidE164(candidate) ? candidate : null;
}

export type CountryOption = { iso: CountryCode; dial: string; name: string; flag: string };

/** 🇬🇧 from "GB" — regional-indicator pair, renders as a flag on every phone. */
export function flagEmoji(iso: string): string {
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/**
 * Every country libphonenumber knows, with its dial code, English name and
 * flag, sorted by name. The login form pins the brand's main markets on top.
 */
export function countryOptions(): CountryOption[] {
  let dn: Intl.DisplayNames | null = null;
  try {
    dn = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    dn = null;
  }
  return getCountries()
    .map((iso) => ({
      iso,
      dial: `+${getCountryCallingCode(iso)}`,
      name: dn?.of(iso) ?? iso,
      flag: flagEmoji(iso),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}
