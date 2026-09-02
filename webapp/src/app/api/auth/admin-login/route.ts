import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { createAdminSession } from "@/server/session";
import { hashPassword, verifyPassword, passwordPolicyError } from "@/server/password";
import { makeLimiter } from "@/server/rate-limit";
import { logAdminAction, type AdminContext } from "@/server/admin";
import { permissionsFor, type Role } from "@/server/permissions";

// Individual staff accounts (admin_users) replace the old single shared
// ADMIN_PASSWORD login. While admin_users is empty, ADMIN_PASSWORD still
// serves one purpose: it's the "setup key" that proves you're allowed to
// bootstrap the first (admin) account — see PUT below. Once that account
// exists, ADMIN_PASSWORD is inert.

const limiter = makeLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

function limiterKey(req: Request, email: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return `${ip}|${email}`;
}

async function isBootstrapped(): Promise<boolean> {
  const row = await db.query.adminUsers.findFirst();
  return !!row;
}

// GET → tells the login page whether to render "first access" (no accounts
// yet) or the normal email+password form.
export async function GET() {
  return Response.json({ bootstrap: !(await isBootstrapped()) });
}

const loginSchema = z.object({ email: z.string().min(1), password: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const email = parsed.data.email.toLowerCase().trim();
  const key = limiterKey(request, email);
  const limit = limiter.hit(key);
  if (!limit.allowed) {
    return Response.json({ error: "too_many_attempts", retryAfterSec: limit.retryAfterSec }, { status: 429 });
  }

  const row = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });
  // Same response whether the email doesn't exist, the account is deactivated,
  // or the password is wrong — never reveal which one it was.
  if (!row || !row.active || !verifyPassword(parsed.data.password, row.passwordHash)) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }

  limiter.reset(key);
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, row.id));
  await createAdminSession(row.id);

  const role = row.role as Role;
  const admin: AdminContext = { ...row, role, permissions: permissionsFor(role) };
  await logAdminAction(admin, "login");

  return Response.json({ ok: true });
}

const bootstrapSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  password: z.string().min(1),
  setupKey: z.string().min(1),
});

// PUT → bootstrap: creates the very first admin_users row (always role "admin").
// Dead once any account exists — see isBootstrapped().
export async function PUT(request: Request) {
  const parsed = bootstrapSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  if (await isBootstrapped()) {
    return Response.json({ error: "already_bootstrapped" }, { status: 409 });
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    console.error("[admin-login] ADMIN_PASSWORD is not set — bootstrap disabled");
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  if (parsed.data.setupKey !== expected) {
    return Response.json({ error: "invalid_setup_key" }, { status: 401 });
  }

  const policyError = passwordPolicyError(parsed.data.password);
  if (policyError) return Response.json({ error: policyError }, { status: 400 });

  const email = parsed.data.email.toLowerCase().trim();
  const [row] = await db
    .insert(adminUsers)
    .values({
      id: crypto.randomUUID(),
      email,
      name: parsed.data.name,
      role: "admin",
      passwordHash: hashPassword(parsed.data.password),
      active: true,
      createdBy: null,
    })
    .returning();

  await createAdminSession(row.id);
  const role = row.role as Role;
  const admin: AdminContext = { ...row, role, permissions: permissionsFor(role) };
  await logAdminAction(admin, "bootstrap");

  return Response.json({ ok: true });
}
