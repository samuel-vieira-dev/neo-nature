import { describe, expect, it } from "vitest";
import { hashPassword, passwordPolicyError, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("the stored hash is not the plaintext", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse battery staple");
  });

  it("verifies the correct password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects the wrong password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong password", hash)).toBe(false);
  });

  it("salts each hash differently, even for the same password", () => {
    const a = hashPassword("same password 123");
    const b = hashPassword("same password 123");
    expect(a).not.toEqual(b);
    expect(verifyPassword("same password 123", a)).toBe(true);
    expect(verifyPassword("same password 123", b)).toBe(true);
  });

  it("returns false (never throws) for a malformed stored string", () => {
    expect(() => verifyPassword("whatever", "not-a-valid-hash")).not.toThrow();
    expect(verifyPassword("whatever", "not-a-valid-hash")).toBe(false);
    expect(verifyPassword("whatever", "")).toBe(false);
    expect(verifyPassword("whatever", "bcrypt$abc$def")).toBe(false);
  });
});

describe("passwordPolicyError", () => {
  it("accepts 10+ characters", () => {
    expect(passwordPolicyError("1234567890")).toBeNull();
  });

  it("rejects shorter passwords", () => {
    expect(passwordPolicyError("short")).toBe("Password must be at least 10 characters");
  });
});
