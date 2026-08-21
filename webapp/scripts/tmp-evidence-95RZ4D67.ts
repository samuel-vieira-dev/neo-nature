/**
 * Evidência read-only (SELECTs apenas): payloads brutos completos dos IPNs
 * do BuyGoods para o pedido 95RZ4D67, com todos os campos decodificados.
 *
 * Usage: npx tsx --env-file=.env.production scripts/tmp-evidence-95RZ4D67.ts
 */
import { rawSql } from "../src/db";

const BG_ID = "95RZ4D67";

async function main() {
  const logs = (await rawSql`
    select id, method, content_type, headers, body,
           to_char(received_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.MS') as received_utc
    from webhook_logs
    where source = 'buygoods' and body like ${"%" + BG_ID + "%"}
    order by received_at asc
  `) as unknown as {
    id: number;
    method: string;
    content_type: string | null;
    headers: Record<string, string>;
    body: string;
    received_utc: string;
  }[];

  for (const l of logs) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`webhook_logs #${l.id} — recebido ${l.received_utc} UTC — ${l.method} ${l.content_type}`);
    console.log(`origem (headers de rede): ${JSON.stringify(
      Object.fromEntries(
        Object.entries(l.headers).filter(([k]) =>
          ["x-forwarded-for", "x-real-ip", "user-agent", "host"].includes(k.toLowerCase())
        )
      )
    )}`);
    console.log(`--- campos do payload (decodificados) ---`);
    for (const [k, v] of new URLSearchParams(l.body)) {
      console.log(`  ${k} = ${v}`);
    }
  }

  await rawSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
