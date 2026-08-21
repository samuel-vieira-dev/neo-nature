import { describe, it, expect } from "vitest";
import { isValidE164, normalizePhone, normalizeIngestPhone, resolveCountry, countryOptions } from "./phone-format";

describe("isValidE164", () => {
  it("accepts a plausible E.164 number", () => {
    expect(isValidE164("+15551234567")).toBe(true);
    expect(isValidE164("+552199999999")).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(isValidE164("15551234567")).toBe(false); // missing +
    expect(isValidE164("+0123456789")).toBe(false); // leading 0 after +
    expect(isValidE164("+1")).toBe(false); // too short
    expect(isValidE164("not a phone")).toBe(false);
  });
});

describe("normalizePhone (login form: country + local number)", () => {
  it("combines the picked country with a locally-typed number", () => {
    expect(normalizePhone("US", "(555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("BR", "21 99999-9999")).toBe("+5521999999999");
  });

  it("drops the UK trunk 0 — the exact case Twilio rejected (+4407713…)", () => {
    expect(normalizePhone("GB", "07713 480000")).toBe("+447713480000");
    expect(normalizePhone("GB", "7713480000")).toBe("+447713480000");
  });

  it("drops trunk prefixes elsewhere in Europe too", () => {
    expect(normalizePhone("DE", "0151 23456789")).toBe("+4915123456789");
    expect(normalizePhone("FR", "06 12 34 56 78")).toBe("+33612345678");
    expect(normalizePhone("IT", "312 345 6789")).toBe("+393123456789");
  });

  it("accepts a full international number typed into the local field", () => {
    expect(normalizePhone("US", "+44 7713 480000")).toBe("+447713480000");
    expect(normalizePhone("US", "0044 7713 480000")).toBe("+447713480000");
    expect(normalizePhone("GB", "44 7713 480000")).toBe("+447713480000");
  });

  it("is lenient with ISO case and common aliases", () => {
    expect(normalizePhone("gb", "07713 480000")).toBe("+447713480000");
    expect(normalizePhone("UK", "07713 480000")).toBe("+447713480000");
  });

  it("returns null when too short, too long, or without a usable country", () => {
    expect(normalizePhone("US", "123")).toBeNull();
    expect(normalizePhone("US", "1".repeat(20))).toBeNull();
    expect(normalizePhone("", "12345678")).toBeNull();
    expect(normalizePhone("ZZ", "12345678")).toBeNull();
  });
});

describe("resolveCountry", () => {
  it("accepts ISO codes in any case and known aliases", () => {
    expect(resolveCountry("US")).toBe("US");
    expect(resolveCountry("gb")).toBe("GB");
    expect(resolveCountry("UK")).toBe("GB");
    expect(resolveCountry("USA")).toBe("US");
  });

  it("accepts English country names", () => {
    expect(resolveCountry("United Kingdom")).toBe("GB");
    expect(resolveCountry("united states")).toBe("US");
    expect(resolveCountry("Brazil")).toBe("BR");
    expect(resolveCountry("Australia")).toBe("AU");
  });

  it("returns undefined for unknown input", () => {
    expect(resolveCountry("")).toBeUndefined();
    expect(resolveCountry(null)).toBeUndefined();
    expect(resolveCountry("Atlantis")).toBeUndefined();
  });
});

describe("normalizeIngestPhone", () => {
  it("assumes +1 for a bare 10-digit US number", () => {
    expect(normalizeIngestPhone("5551234567")).toBe("+15551234567");
    expect(normalizeIngestPhone("(555) 123-4567")).toBe("+15551234567");
  });

  it("adds + for an 11-digit number already starting with 1", () => {
    expect(normalizeIngestPhone("15551234567")).toBe("+15551234567");
  });

  it("falls back to +digits for other lengths when still valid E.164", () => {
    expect(normalizeIngestPhone("552199999999")).toBe("+552199999999");
  });

  it("uses the order's country to read a local-format international number", () => {
    expect(normalizeIngestPhone("07713 480000", "United Kingdom")).toBe("+447713480000");
    expect(normalizeIngestPhone("07713480000", "GB")).toBe("+447713480000");
    expect(normalizeIngestPhone("0412 345 678", "AU")).toBe("+61412345678");
    expect(normalizeIngestPhone("11 98765-4321", "Brazil")).toBe("+5511987654321");
  });

  it("keeps the US assumption when the hint is US or unknown", () => {
    expect(normalizeIngestPhone("5551234567", "US")).toBe("+15551234567");
    expect(normalizeIngestPhone("5551234567", "Atlantis")).toBe("+15551234567");
  });

  it("trusts an explicit + / 00 prefix over the hint", () => {
    expect(normalizeIngestPhone("+44 7713 480000", "US")).toBe("+447713480000");
    expect(normalizeIngestPhone("0044 7713 480000", "US")).toBe("+447713480000");
    // international form with the trunk 0 wrongly left in (the Twilio log case)
    expect(normalizeIngestPhone("+4407713480000")).toBe("+447713480000");
  });

  it("returns null for empty/invalid input", () => {
    expect(normalizeIngestPhone(undefined)).toBeNull();
    expect(normalizeIngestPhone("")).toBeNull();
    expect(normalizeIngestPhone("abc")).toBeNull();
    expect(normalizeIngestPhone("123")).toBeNull();
  });
});

describe("countryOptions", () => {
  it("covers the whole world, sorted by name, with dial codes and flags", () => {
    const opts = countryOptions();
    expect(opts.length).toBeGreaterThan(200);
    const names = opts.map((o) => o.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    const gb = opts.find((o) => o.iso === "GB")!;
    expect(gb.dial).toBe("+44");
    expect(gb.name).toBe("United Kingdom");
    expect(gb.flag).toBe("🇬🇧");
  });
});
