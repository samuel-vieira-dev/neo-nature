import { after } from "next/server";
import { db } from "@/db";
import { webhookLogs } from "@/db/schema";
import { parseIpnParams, ingestBuyGoodsEvent } from "@/server/buygoods";
import { classifyBuyGoodsEvent, forwardToN8n } from "@/server/n8n-forward";

/**
 * BuyGoods IPN endpoint. Captures every hit (headers/query/body) to
 * webhook_logs for auditing, ingests order events into the orders table (see
 * src/server/buygoods.ts), and fans the same event out to the client's n8n
 * webhooks (see src/server/n8n-forward.ts). Always returns 200 so BuyGoods
 * doesn't retry.
 *
 * Intentionally public — see PUBLIC_PATHS in src/proxy.ts. BuyGoods has no
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
  const receivedAt = new Date();

  console.log(`[webhook-buygoods-info] ${request.method} ${url.pathname}${url.search}`);
  if (rawBody) console.log("[webhook-buygoods-info] body:", rawBody);

  // 1) audit capture — never let a logging hiccup fail the webhook
  try {
    await db.insert(webhookLogs).values({
      source: "buygoods",
      method: request.method,
      contentType: headers["content-type"] ?? null,
      headers,
      query,
      body: rawBody,
      receivedAt,
    });
  } catch (e) {
    console.error("[webhook-buygoods-info] failed to persist log:", e);
  }

  const params = parseIpnParams(query, rawBody);

  // 2) ingest the order event (skips test pings; idempotent by order id)
  try {
    if (params.order_id_global) {
      const result = await ingestBuyGoodsEvent(params, query.event);
      console.log("[webhook-buygoods-info] ingest:", JSON.stringify(result));
    }
  } catch (e) {
    console.error("[webhook-buygoods-info] ingest failed:", e);
  }

  // 3) fan-out to n8n — scheduled via after() so it runs once the response
  // has gone out to BuyGoods, and can never fail or delay that response
  // (forwardToN8n swallows every error itself; classify is a pure, throw-free
  // lookup, but is still guarded here out of caution).
  try {
    const target = classifyBuyGoodsEvent(params, query.event);
    if (target) {
      after(() =>
        forwardToN8n(target, params, {
          receivedAt: receivedAt.toISOString(),
          eventTag: query.event,
          contentType: headers["content-type"] ?? null,
          method: request.method,
          rawBody,
        })
      );
    }
  } catch (e) {
    console.error("[webhook-buygoods-info] n8n classify failed:", e);
  }

  return Response.json({ ok: true, received: true });
}

export const GET = capture;
export const POST = capture;
export const PUT = capture;
