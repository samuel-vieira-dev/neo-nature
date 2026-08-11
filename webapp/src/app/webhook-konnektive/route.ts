import { db } from "@/db";
import { webhookLogs } from "@/db/schema";

/**
 * Konnektive order webhook. For now it only captures every hit
 * (method/url/headers/query/body) to webhook_logs so we can inspect real
 * payloads before designing the ingest. Always returns 200 so Konnektive
 * doesn't retry.
 *
 * Intentionally public — see APP_PUBLIC in src/proxy.ts. Konnektive has no
 * session cookie.
 */
async function capture(request: Request) {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const rawBody = await request.text().catch(() => "");

  console.log(`[webhook-konnektive] ${request.method} ${url.pathname}${url.search}`);
  console.log("[webhook-konnektive] headers:", JSON.stringify(headers));
  if (rawBody) console.log("[webhook-konnektive] body:", rawBody);

  // Never let a logging hiccup fail the webhook.
  try {
    await db.insert(webhookLogs).values({
      source: "konnektive",
      method: request.method,
      contentType: headers["content-type"] ?? null,
      headers,
      query,
      body: rawBody,
    });
  } catch (e) {
    console.error("[webhook-konnektive] failed to persist log:", e);
  }

  return Response.json({ ok: true, received: true });
}

export const GET = capture;
export const POST = capture;
export const PUT = capture;
