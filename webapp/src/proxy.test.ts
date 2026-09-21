import { expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { proxy } from "./proxy";

it.each(["/", "/login"])("routes campaign links at %s to automatic access before rendering", async (path) => {
  const response = await proxy(new NextRequest(`https://example.com${path}?order_id=42&email=buyer%2Border%40example.com`));
  const destination = new URL(response.headers.get("location")!);
  expect(destination.pathname).toBe("/api/auth/link");
  expect(destination.searchParams.get("order_id")).toBe("42");
  expect(destination.searchParams.get("email")).toBe("buyer+order@example.com");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});

it("processes a new buyer's link even when another buyer is already signed in", async () => {
  const token = await new SignJWT({ uid: "previous-buyer" })
    .setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret-change-me"));
  const response = await proxy(new NextRequest("https://example.com/login?order_id=42&email=new%40example.com", {
    headers: { cookie: `nn_session=${token}` },
  }));
  expect(new URL(response.headers.get("location")!).pathname).toBe("/api/auth/link");
});

it("keeps the invalid-link page accessible without a session", async () => {
  const response = await proxy(new NextRequest("https://example.com/access-error"));
  expect(response.headers.get("location")).toBeNull();
  expect(response.status).toBe(200);
});

it("does not grant anonymous access to customer data", async () => {
  const response = await proxy(new NextRequest("https://example.com/api/orders"));
  expect(response.status).toBe(401);
});
