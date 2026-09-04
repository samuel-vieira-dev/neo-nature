/**
 * Liveness probe for Railway's deploy healthcheck (see railway.json).
 *
 * Deliberately dependency-free: it answers "is this container up and serving
 * this build?", not "is the database happy?". A DB blip must not block a
 * rollout of the very code that might fix it. Public — listed in APP_PUBLIC
 * in src/proxy.ts, since the healthchecker carries no cookie.
 */
export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
