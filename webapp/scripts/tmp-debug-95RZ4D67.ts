/**
 * Diagnóstico read-only (SELECTs apenas) para o pedido 95RZ4D67:
 * de onde saiu o status "canceled"?
 *
 * Usage: npx tsx --env-file=.env.production scripts/tmp-debug-95RZ4D67.ts
 */
import { rawSql } from "../src/db";

const BG_ID = "95RZ4D67";

function extract(body: string, query: Record<string, string>, field: string): string {
  if (body.trim().startsWith("{")) {
    try {
      const j = JSON.parse(body) as Record<string, unknown>;
      const v = j[field];
      if (v !== null && v !== undefined && typeof v !== "object") return String(v);
    } catch {
      /* fallthrough */
    }
  }
  const m = body.match(new RegExp(`(?:^|&)${field}=([^&]*)`));
  if (m) {
    try {
      return decodeURIComponent(m[1].replace(/\+/g, " "));
    } catch {
      return m[1];
    }
  }
  return query[field] ?? "";
}

async function main() {
  const order = (await rawSql`
    select id, status, placed_at, fulfilled_at, refunded_at, chargeback_at,
           shipping_status, shipping_tracking_id, tracking_steps, product_name
    from orders where buygoods_order_id = ${BG_ID}
  `) as unknown as Record<string, unknown>[];
  console.log("=== linha na tabela orders ===");
  console.log(JSON.stringify(order, null, 2));

  const logs = (await rawSql`
    select id, source, method, content_type, query, body,
           to_char(received_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as received_utc
    from webhook_logs
    where body like ${"%" + BG_ID + "%"} or query::text like ${"%" + BG_ID + "%"}
    order by received_at asc
  `) as unknown as {
    id: number;
    source: string;
    method: string;
    content_type: string | null;
    query: Record<string, string>;
    body: string;
    received_utc: string;
  }[];

  console.log(`\n=== ${logs.length} webhook_logs contendo ${BG_ID} ===`);
  const fields = [
    "action_type",
    "type",
    "was_canceled",
    "was_fulfilled",
    "shipping_status",
    "shipping_tracking_id",
    "order_status",
    "rebill_status",
    "date_fulfillment",
  ];
  for (const l of logs) {
    const vals = fields
      .map((f) => [f, extract(l.body, l.query, f)] as const)
      .filter(([, v]) => v !== "")
      .map(([f, v]) => `${f}=${v}`)
      .join("  ");
    const eventTag = l.query.event ? `query.event=${l.query.event}  ` : "";
    console.log(`\n#${l.id}  ${l.received_utc}Z  ${l.method}  ${l.content_type ?? "-"}  src=${l.source}`);
    console.log(`  ${eventTag}${vals || "(nenhum campo de status presente)"}`);
    console.log(`  body: ${l.body.slice(0, 600)}${l.body.length > 600 ? " …[truncado]" : ""}`);
  }

  await rawSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
