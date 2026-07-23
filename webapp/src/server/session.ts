import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

const COOKIE = "nn_session";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret-change-me");

export async function createSession(userId: string) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function sessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return (payload.uid as string) ?? null;
  } catch {
    return null;
  }
}

/** Loads the authenticated user or throws a 401 Response */
export async function requireUser(): Promise<User> {
  const uid = await sessionUserId();
  if (!uid) throw unauthorized();
  const user = await db.query.users.findFirst({ where: eq(users.id, uid) });
  if (!user) throw unauthorized();
  return user;
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
