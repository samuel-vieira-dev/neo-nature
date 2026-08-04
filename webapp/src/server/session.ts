import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

// Two independent sessions so the customer app and the admin panel can be open
// in normal browser tabs at the same time (same origin, different cookies).
export const APP_COOKIE = "nn_session";
export const ADMIN_COOKIE = "nn_admin";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret-change-me");

async function setSessionCookie(name: string, userId: string, opts?: { expiresIn?: string; maxAgeSec?: number; extra?: Record<string, unknown> }) {
  const expiresIn = opts?.expiresIn ?? "30d";
  const maxAge = opts?.maxAgeSec ?? 60 * 60 * 24 * 30;
  const token = await new SignJWT({ uid: userId, ...opts?.extra })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret());

  const jar = await cookies();
  jar.set(name, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
    path: "/",
  });
}

async function payloadFromCookie(name: string): Promise<Record<string, unknown> | null> {
  const jar = await cookies();
  const token = jar.get(name)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload;
  } catch {
    return null;
  }
}

async function userIdFromCookie(name: string): Promise<string | null> {
  const payload = await payloadFromCookie(name);
  return (payload?.uid as string) ?? null;
}

export const createSession = (userId: string) => setSessionCookie(APP_COOKIE, userId);
export const createAdminSession = (userId: string) => setSessionCookie(ADMIN_COOKIE, userId);
export const sessionUserId = () => userIdFromCookie(APP_COOKIE);
export const adminSessionUserId = () => userIdFromCookie(ADMIN_COOKIE);

const IMPERSONATION_TTL = "15m";

/**
 * Logs an admin into a customer's own session cookie so they can view the
 * live app exactly as the customer does. Short-lived (15m) and carries the
 * impersonating admin's id in the JWT so the UI can show a banner and the
 * action is traceable — this never touches the admin's own nn_admin cookie,
 * so returning to /admin needs no re-login.
 */
export const createImpersonationSession = (userId: string, adminUserId: string) =>
  setSessionCookie(APP_COOKIE, userId, { expiresIn: IMPERSONATION_TTL, maxAgeSec: 60 * 15, extra: { impersonatedBy: adminUserId } });

/** Returns the impersonating admin's user id if the current app session is an impersonation, else null. */
export async function impersonatorId(): Promise<string | null> {
  const payload = await payloadFromCookie(APP_COOKIE);
  return (payload?.impersonatedBy as string) ?? null;
}

export async function destroySession() {
  (await cookies()).delete(APP_COOKIE);
}
export async function destroyAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

/** Loads the authenticated user or throws a 401 Response */
export async function requireUser(): Promise<User> {
  const uid = await sessionUserId();
  if (uid) {
    const user = await db.query.users.findFirst({ where: eq(users.id, uid) });
    if (user) return user;
  }
  // Stale/invalid session (valid JWT but the user no longer exists, e.g. after
  // a data reset). Clear the cookie so the client isn't stuck in a login↔home
  // redirect loop — the proxy trusts the JWT, but the DB is the source of truth.
  await destroySession();
  throw unauthorized();
}

/** Loads the authenticated user or null (never throws) — for page gating. */
export async function getUser(): Promise<User | null> {
  const uid = await sessionUserId();
  if (!uid) return null;
  return (await db.query.users.findFirst({ where: eq(users.id, uid) })) ?? null;
}

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

/**
 * Wraps a route handler: resolves the user, converts thrown Responses into
 * returned responses, and reports unexpected errors as 500s.
 */
export function withUser<T extends unknown[]>(
  handler: (user: User, ...args: T) => Promise<Response>
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      const user = await requireUser();
      return await handler(user, ...args);
    } catch (e) {
      if (e instanceof Response) return e;
      console.error("[api]", e);
      return Response.json({ error: "internal" }, { status: 500 });
    }
  };
}
