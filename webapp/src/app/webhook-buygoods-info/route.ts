import { db } from "@/db";
import { webhookLogs } from "@/db/schema";

/**
 * Temporary capture endpoint for BuyGoods test payloads.
 *
 * Purpose: BuyGoods doesn't have a documented postback format on hand yet.
 * This endpoint accepts ANY method/content-type, logs it (console + DB), and
 * always returns 200 so BuyGoods' delivery attempts don't retry/fail. Once
 * we've collected real sample payloads (order confirmation, shipment/tracking
 * update, refund, etc.) we replace this with a real handler in
 * src/server/jobs.ts-style logic that updates orders/invoices per the actual
 * schema BuyGoods sends.
 *
 * Intentionally public — see PUBLIC_PATHS in src/proxy.ts. BuyGoods will not
 * have a session cookie.
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

  console.log(`[webhook-buygoods-info] ${request.method} ${url.pathname}${url.search}`);
  console.log("[webhook-buygoods-info] headers:", JSON.stringify(headers));
  if (rawBody) console.log("[webhook-buygoods-info] body:", rawBody);

  try {
    await db.insert(webhookLogs).values({
      source: "buygoods",
      method: request.method,
      contentType: headers["content-type"] ?? null,
      headers,
      query,
      body: rawBody,
    });
  } catch (e) {
    // Never fail the webhook response because of a logging hiccup
    console.error("[webhook-buygoods-info] failed to persist log:", e);
  }

  return Response.json({ ok: true, received: true });
}

export const GET = capture;
export const POST = capture;
export const PUT = capture;
