// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter. Single-instance (Railway) is
// sufficient here — this only gates the admin login form, not a public API.
// `now` is injectable so tests don't depend on real time.
// ---------------------------------------------------------------------------

export type RateLimitResult = { allowed: boolean; retryAfterSec: number };

export function makeLimiter(opts: { max: number; windowMs: number }) {
  const hits = new Map<string, number[]>();

  function hit(key: string, now: number = Date.now()): RateLimitResult {
    const windowStart = now - opts.windowMs;
    const existing = (hits.get(key) ?? []).filter((t) => t > windowStart);

    if (existing.length >= opts.max) {
      const retryAfterMs = existing[0] + opts.windowMs - now;
      hits.set(key, existing);
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }

    existing.push(now);
    hits.set(key, existing);
    return { allowed: true, retryAfterSec: 0 };
  }

  function reset(key: string): void {
    hits.delete(key);
  }

  return { hit, reset };
}
