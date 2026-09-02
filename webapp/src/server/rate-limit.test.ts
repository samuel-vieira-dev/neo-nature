import { describe, expect, it } from "vitest";
import { makeLimiter } from "./rate-limit";

describe("makeLimiter", () => {
  it("allows up to max attempts, then blocks the next one", () => {
    const limiter = makeLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
    const key = "1.2.3.4|admin@neonature.com";
    let now = 1_000_000;

    for (let i = 0; i < 5; i++) {
      const r = limiter.hit(key, now);
      expect(r.allowed).toBe(true);
      now += 1000;
    }

    const sixth = limiter.hit(key, now);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterSec).toBeGreaterThan(0);
  });

  it("allows again once the window has passed", () => {
    const limiter = makeLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
    const key = "1.2.3.4|admin@neonature.com";
    let now = 0;

    for (let i = 0; i < 5; i++) {
      expect(limiter.hit(key, now).allowed).toBe(true);
      now += 1000;
    }
    expect(limiter.hit(key, now).allowed).toBe(false);

    // Jump past the 15-minute window entirely.
    now += 15 * 60 * 1000 + 1;
    expect(limiter.hit(key, now).allowed).toBe(true);
  });

  it("reset() clears the counter for a key", () => {
    const limiter = makeLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
    const key = "1.2.3.4|admin@neonature.com";
    let now = 0;

    for (let i = 0; i < 5; i++) {
      limiter.hit(key, now);
      now += 1000;
    }
    expect(limiter.hit(key, now).allowed).toBe(false);

    limiter.reset(key);
    expect(limiter.hit(key, now).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = makeLimiter({ max: 1, windowMs: 1000 });
    expect(limiter.hit("a", 0).allowed).toBe(true);
    expect(limiter.hit("a", 0).allowed).toBe(false);
    expect(limiter.hit("b", 0).allowed).toBe(true);
  });
});
