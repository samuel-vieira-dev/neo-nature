/**
 * Read-only diagnostic (SELECTs only — writes nothing, safe against prod).
 *
 * Responde: na janela escolhida o BuyGoods mandou shipping_tracking_id nos
 * IPNs, quais produtos vieram com codigo, e esse codigo realmente chegou na
 * tabela orders? Compara o ultimo IPN de cada pedido contra a linha gravada.
 *
 * Datas sao formatadas no proprio SQL (America/Sao_Paulo) — o driver nem
 * sempre devolve timestamptz como Date, entao nao dependemos disso.
 *
 * Usage:
 *   npx tsx --env-file=.env.production scripts/check-tracking.ts
 *   npx tsx --env-file=.env.production scripts/check-tracking.ts --hours=48
 */
import { rawSql } from "../src/db";

const hoursArg = process.argv.find((a) => a.startsWith("--hours="));
const hours = Math.max(1, parseInt(hoursArg?.split("=")[1] ?? "24", 10) || 24);

/** Campos do IPN vem url-encoded ("Hero%20Up", "a+b") — o Postgres nao decodifica. */
const decode = (v: string | null): string => {
  if (!v) return "";
  try {
    return decodeURIComponent(v.replace(/\+/g, " "));
  } catch {
    return v;
  }
};

type IpnRow = {
  quando: string;
  order_id_global: string | null;
  tracking: string | null;
  was_fulfilled: string | null;
  produto_codename: string | null;
  produto_nome: string | null;
};

async function main() {
  console.log(`\nJanela: ultimas ${hours} horas\n${"=".repeat(60)}`);

  const ipns = (await rawSql`
    select
      to_char(received_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as quando,
      (regexp_match(body, 'order_id_global=([^&]*)'))[1]                  as order_id_global,
      nullif((regexp_match(body, 'shipping_tracking_id=([^&]*)'))[1], '') as tracking,
      nullif((regexp_match(body, 'was_fulfilled=([^&]*)'))[1], '')        as was_fulfilled,
      nullif((regexp_match(body, 'product_codename=([^&]*)'))[1], '')     as produto_codename,
      nullif((regexp_match(body, 'product_name=([^&]*)'))[1], '')         as produto_nome
    from webhook_logs
    where source = 'buygoods'
      and received_at > now() - (${hours} || ' hours')::interval
    order by received_at desc
  `) as unknown as IpnRow[];

  const comTracking = ipns.filter((r) => r.tracking);
  const fulfilled = ipns.filter((r) => r.was_fulfilled && r.was_fulfilled !== "0");

  console.log(`=== IPNs do BuyGoods ===`);
  console.log(`total de IPNs recebidos : ${ipns.length}`);
  console.log(`com shipping_tracking_id: ${comTracking.length}`);
  console.log(`marcados was_fulfilled  : ${fulfilled.length}`);
  console.log(`despachados SEM codigo  : ${fulfilled.filter((r) => !r.tracking).length}`);

  // ---- quais produtos receberam codigo ----
  type Agg = { comCodigo: number; semCodigo: number; pedidos: Set<string>; nome: string };
  const porProduto = new Map<string, Agg>();
  for (const r of ipns) {
    const key = decode(r.produto_codename) || "(sem product_codename)";
    if (!porProduto.has(key)) porProduto.set(key, { comCodigo: 0, semCodigo: 0, pedidos: new Set(), nome: "" });
    const agg = porProduto.get(key)!;
    if (!agg.nome) agg.nome = decode(r.produto_nome);
    if (r.tracking) {
      agg.comCodigo++;
      if (r.order_id_global) agg.pedidos.add(r.order_id_global);
    } else if (r.was_fulfilled && r.was_fulfilled !== "0") {
      agg.semCodigo++;
    }
  }

  console.log(`\n=== Produtos que receberam tracking code ===`);
  const linhas = [...porProduto.entries()].sort((a, b) => b[1].comCodigo - a[1].comCodigo);
  for (const [codename, agg] of linhas) {
    const rotulo = agg.nome ? `${codename} (${agg.nome})` : codename;
    console.log(
      `  ${rotulo.padEnd(42)} com codigo=${String(agg.comCodigo).padStart(3)}  ` +
        `pedidos=${String(agg.pedidos.size).padStart(3)}  despachado sem codigo=${agg.semCodigo}`
    );
  }

  if (comTracking.length) {
    console.log(`\n=== IPNs que trouxeram codigo (ate 40) ===`);
    for (const r of comTracking.slice(0, 40)) {
      const produto = decode(r.produto_codename) || "-";
      console.log(`  ${r.quando}  ${(r.order_id_global ?? "-").padEnd(22)} ${(r.tracking ?? "").padEnd(24)} ${produto}`);
    }
  }

  // ---- o codigo do IPN chegou na tabela orders? ----
  const conferencia = (await rawSql`
    with ipn as (
      select
        (regexp_match(body, 'order_id_global=([^&]*)'))[1]                  as bg_id,
        nullif((regexp_match(body, 'shipping_tracking_id=([^&]*)'))[1], '') as tracking,
        received_at
      from webhook_logs
      where source = 'buygoods'
        and received_at > now() - (${hours} || ' hours')::interval
    ),
    ultimo as (
      select distinct on (bg_id) bg_id, tracking
      from ipn
      where bg_id is not null and tracking is not null
      order by bg_id, received_at desc
    )
    select u.bg_id, u.tracking as tracking_no_ipn,
           o.shipping_tracking_id as tracking_no_pedido,
           o.status,
           (o.id is null) as pedido_ausente,
           (o.shipping_tracking_id is not distinct from u.tracking) as bate
    from ultimo u
    left join orders o on o.buygoods_order_id = u.bg_id
    order by bate asc, u.bg_id
  `) as unknown as {
    bg_id: string;
    tracking_no_ipn: string;
    tracking_no_pedido: string | null;
    status: string | null;
    pedido_ausente: boolean;
    bate: boolean;
  }[];

  console.log(`\n=== Conferencia IPN -> tabela orders ===`);
  if (!conferencia.length) {
    console.log("  nenhum IPN com tracking na janela, nada a conferir");
  } else {
    const problemas = conferencia.filter((r) => !r.bate || r.pedido_ausente);
    for (const r of problemas.slice(0, 40)) {
      const marca = r.pedido_ausente ? "PEDIDO NAO EXISTE" : "DIVERGENTE";
      console.log(
        `  [${marca}] ${r.bg_id}  ipn=${r.tracking_no_ipn}  pedido=${r.tracking_no_pedido ?? "(vazio)"}  status=${r.status ?? "-"}`
      );
    }
    if (!problemas.length) console.log("  todos conferem");
    console.log(`\n  ok: ${conferencia.length - problemas.length} / ${conferencia.length} pedidos`);
  }

  // ---- exemplos para conferir na visao do cliente ----
  // Um pedido so aparece no app se estiver ligado a uma conta: por user_id, ou
  // pelo email/telefone do cliente (ver userOrdersCondition em
  // src/app/api/orders/route.ts). Sem nenhum desses, o rastreio existe no banco
  // mas ninguem consegue ver — por isso a coluna "visivel".
  const exemplos = (await rawSql`
    select o.id, o.buygoods_order_id, o.status, o.shipping_tracking_id,
           o.customer_name, o.email, o.customer_phone_e164,
           o.user_id is not null as tem_conta_ligada,
           exists (
             select 1 from users u
             where (nullif(o.email,'') is not null and lower(u.email) = lower(o.email))
                or (o.customer_phone_e164 is not null and u.phone = o.customer_phone_e164)
           ) as bate_por_contato,
           to_char(o.fulfilled_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as despachado_em
    from orders o
    where o.shipping_tracking_id is not null
    order by o.fulfilled_at desc nulls last, o.placed_at desc
    limit 15
  `) as unknown as {
    id: string;
    buygoods_order_id: string | null;
    status: string;
    shipping_tracking_id: string;
    customer_name: string;
    email: string;
    customer_phone_e164: string | null;
    tem_conta_ligada: boolean;
    bate_por_contato: boolean;
    despachado_em: string | null;
  }[];

  console.log(`\n=== Exemplos: pedidos COM codigo de rastreio (para abrir no app) ===`);
  if (!exemplos.length) {
    console.log(`  nenhum pedido com codigo de rastreio no banco`);
  } else {
    for (const e of exemplos) {
      const visivel = e.tem_conta_ligada ? "SIM" : e.bate_por_contato ? "sim (por contato)" : "NAO - sem conta";
      console.log(`\n  pedido ${e.buygoods_order_id ?? e.id}   status=${e.status}   despachado ${e.despachado_em ?? "-"}`);
      console.log(`    cliente  : ${e.customer_name || "(sem nome)"}  <${e.email || "sem email"}>  ${e.customer_phone_e164 ?? ""}`);
      console.log(`    tracking : ${e.shipping_tracking_id}`);
      console.log(`    visivel no app: ${visivel}`);
      console.log(`    url      : /orders/${e.id}`);
    }
    const invisiveis = exemplos.filter((e) => !e.tem_conta_ligada && !e.bate_por_contato).length;
    if (invisiveis) {
      console.log(`\n  ATENCAO: ${invisiveis} destes tem codigo no banco mas nenhuma conta consegue ver.`);
    }
  }

  // ---- por que nenhum pedido fica 'shipped'? ----
  // deriveStatus (src/server/buygoods.ts) testa cancelamento ANTES de despacho,
  // entao qualquer IPN com was_canceled=1 (ou action contendo "cancel") derruba
  // o pedido para 'canceled' mesmo tendo sido despachado. Aqui vemos quais
  // combinacoes de flags realmente chegam junto com o codigo de rastreio.
  const flags = (await rawSql`
    select
      coalesce(nullif((regexp_match(body, 'action_type=([^&]*)'))[1], ''), '-')   as action_type,
      coalesce(nullif((regexp_match(body, '(?:^|&)type=([^&]*)'))[1], ''), '-')   as tipo,
      coalesce(nullif((regexp_match(body, 'was_canceled=([^&]*)'))[1], ''), '-')  as was_canceled,
      coalesce(nullif((regexp_match(body, 'was_fulfilled=([^&]*)'))[1], ''), '-') as was_fulfilled,
      coalesce(nullif((regexp_match(body, 'was_refunded=([^&]*)'))[1], ''), '-')  as was_refunded,
      (nullif((regexp_match(body, 'shipping_tracking_id=([^&]*)'))[1], '') is not null) as tem_tracking,
      count(*)::int as ipns
    from webhook_logs
    where source = 'buygoods'
    group by 1,2,3,4,5,6
    order by tem_tracking desc, ipns desc
  `) as unknown as {
    action_type: string;
    tipo: string;
    was_canceled: string;
    was_fulfilled: string;
    was_refunded: string;
    tem_tracking: boolean;
    ipns: number;
  }[];

  console.log(`\n=== Flags dos IPNs (todos os tempos) — por que ninguem fica 'shipped' ===`);
  console.log(`  ${"action_type".padEnd(22)} ${"type".padEnd(14)} canc ful refu track  ipns`);
  for (const f of flags) {
    console.log(
      `  ${decode(f.action_type).padEnd(22)} ${decode(f.tipo).padEnd(14)} ` +
        `${f.was_canceled.padEnd(4)} ${f.was_fulfilled.padEnd(3)} ${f.was_refunded.padEnd(4)} ` +
        `${(f.tem_tracking ? "SIM" : "-").padEnd(5)} ${f.ipns}`
    );
  }

  const comTrack = flags.filter((f) => f.tem_tracking);
  const perdidos = comTrack.filter((f) => f.was_canceled === "1" || /cancel/i.test(decode(f.action_type) + decode(f.tipo)));
  if (perdidos.length) {
    const total = perdidos.reduce((s, f) => s + f.ipns, 0);
    console.log(
      `\n  >> ${total} IPNs trazem codigo de rastreio E disparam a regra de cancelamento.` +
        `\n     Esses viram status 'canceled' e o cliente nunca ve a tela de rastreio.`
    );
  }

  // ---- cobertura geral ----
  const cobertura = (await rawSql`
    select status, count(*)::int as pedidos,
           count(shipping_tracking_id)::int as com_tracking,
           (count(*) - count(shipping_tracking_id))::int as sem_tracking
    from orders
    group by status
    order by status
  `) as unknown as { status: string; pedidos: number; com_tracking: number; sem_tracking: number }[];

  console.log(`\n=== Cobertura de tracking por status (todos os pedidos, qualquer data) ===`);
  for (const r of cobertura) {
    console.log(`  ${r.status.padEnd(10)} pedidos=${r.pedidos}  com=${r.com_tracking}  sem=${r.sem_tracking}`);
  }
  console.log("");
}

main()
  .then(() => rawSql.end())
  .catch(async (e) => {
    console.error(e);
    await rawSql.end();
    process.exit(1);
  });
