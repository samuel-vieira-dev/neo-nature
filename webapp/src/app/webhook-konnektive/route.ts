import { db } from "@/db";
import { webhookLogs } from "@/db/schema";
import { normalize, ingestKonnektiveOrder } from "@/server/konnektive";

/**
 * Konnektive order webhook. Captures every hit (headers/query/body) to
 * webhook_logs for auditing, then ingests orders (see src/server/konnektive.ts,
 * which explains the two payload shapes that arrive here). Always returns 200
 * so Konnektive doesn't retry.
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

  // 2) Ingest the order. Skips partial checkouts and out-of-scope campaigns;
  //    idempotent by clientOrderId, so replays and retries are free.
  try {
    const parsed = normalize(rawBody ? JSON.parse(rawBody) : null, {
      replayHeader: headers["x-webhook-replay"] === "true",
    });
    if (!parsed.ok) {
      console.log("[webhook-konnektive] skipped:", parsed.reason);
    } else {
      const result = await ingestKonnektiveOrder(parsed.order);
      console.log("[webhook-konnektive] ingest:", JSON.stringify(result));
    }
  } catch (e) {
    console.error("[webhook-konnektive] ingest failed:", e);
  }

  return Response.json({ ok: true, received: true });
}

export const GET = capture;
export const POST = capture;
export const PUT = capture;
