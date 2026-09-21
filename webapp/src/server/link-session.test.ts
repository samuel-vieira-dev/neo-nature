import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
const mocks = vi.hoisted(() => ({ jar: new Map<string, string>(), findUser: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => mocks.jar.has(name) ? { value: mocks.jar.get(name) } : undefined,
  set: (name: string, value: string) => mocks.jar.set(name, value),
  delete: (name: string) => mocks.jar.delete(name),
}) }));
vi.mock("@/db", () => ({ db: { query: { users: { findFirst: mocks.findUser } } } }));
import { APP_COOKIE, createLinkSession, createSession, linkSession, requirePurchaseEmailConfirmation, requireRefundAccess, destroySession } from "./session";

beforeEach(() => { mocks.jar.clear(); mocks.findUser.mockResolvedValue({ id: "customer" }); });
describe("purchase link sessions", () => {
  it("requires email confirmation before support and refund access", async () => {
    await createLinkSession("customer", "purchase");
    expect(await linkSession()).toEqual({ userId: "customer", orderId: "purchase", confirmed: false });
    await expect(requirePurchaseEmailConfirmation()).rejects.toMatchObject({ status: 403 });
    await expect(requireRefundAccess()).rejects.toMatchObject({ status: 403 });
  });
  it("allows confirmed customers and preserves normal SMS sessions", async () => {
    await createLinkSession("customer", "purchase", true);
    await expect(requirePurchaseEmailConfirmation()).resolves.toBeUndefined();
    await expect(requireRefundAccess()).resolves.toMatchObject({ user: { id: "customer" } });
    await createSession("customer");
    expect(await linkSession()).toBeNull();
    await expect(requirePurchaseEmailConfirmation()).resolves.toBeUndefined();
  });
  it("a new link clears previous confirmation, including account switches", async () => {
    await createLinkSession("customer", "purchase", true);
    await createLinkSession("other", "other-purchase");
    expect(await linkSession()).toEqual({ userId: "other", orderId: "other-purchase", confirmed: false });
  });
  it("rejects forged and expired sessions", async () => {
    mocks.jar.set(APP_COOKIE, "forged");
    await expect(requireRefundAccess()).rejects.toMatchObject({ status: 401 });
    const token = await new SignJWT({ uid: "customer", access: "purchase-link", orderId: "purchase", purchaseEmailConfirmed: true })
      .setProtectedHeader({ alg: "HS256" }).setExpirationTime(1)
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret-change-me"));
    mocks.jar.set(APP_COOKIE, token);
    await expect(requireRefundAccess()).rejects.toMatchObject({ status: 401 });
  });
  it("logout removes link access", async () => {
    await createLinkSession("customer", "purchase");
    await destroySession();
    expect(await linkSession()).toBeNull();
    await expect(requireRefundAccess()).rejects.toMatchObject({ status: 401 });
  });
});
