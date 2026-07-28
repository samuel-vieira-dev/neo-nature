import { describe, it, expect } from "vitest";
import { isValidE164, normalizePhone, normalizeIngestPhone } from "./phone-format";

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

describe("normalizePhone", () => {
  it("combines a dial code with a locally-typed number", () => {
    expect(normalizePhone("+1", "(555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("+55", "21 99999-9999")).toBe("+5521999999999");
  });

  it("returns null when too short or too long", () => {
    expect(normalizePhone("+1", "123")).toBeNull();
    expect(normalizePhone("+1", "1".repeat(20))).toBeNull();
  });

  it("returns null when the combined result isn't valid E.164 (e.g. missing dial code)", () => {
    expect(normalizePhone("", "12345678")).toBeNull();
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

  it("returns null for empty/invalid input", () => {
    expect(normalizeIngestPhone(undefined)).toBeNull();
    expect(normalizeIngestPhone("")).toBeNull();
    expect(normalizeIngestPhone("abc")).toBeNull();
    expect(normalizeIngestPhone("123")).toBeNull();
  });
});
