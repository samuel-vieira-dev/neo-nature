/**
 * Diagnóstico READ-ONLY da falha de login (código SMS) — 20/08/2026 ~04h.
 *
 * Faz duas leituras, nada mais:
 *   1. otp_codes das últimas 48h  (SELECT)  → o pedido chegou a criar código?
 *   2. Twilio Messages API        (GET)     → o Twilio aceitou ou recusou o envio?
 *
 * Usage: npx tsx --env-file=.env.production scripts/tmp-login-investig.ts
 */
import { rawSql } from "../src/db";

type OtpRow = {
  id: number;
  phone: string | null;
  email: string | null;
  code: string;
  req_utc: string;
  req_brt: string;
  used_utc: string | null;
  user_id: string | null;
  last_login_utc: string | null;
};

async function otpAudit() {
  console.log("=".repeat(78));
  console.log("1) PEDIDOS DE CÓDIGO (otp_codes) — últimas 48h");
  console.log("   obs: a linha é gravada ANTES de chamar o Twilio. Linha existindo =");
  console.log("   a API respondeu e o código foi gerado; a falha foi no envio (502).");
  console.log("=".repeat(78));

  const rows = (await rawSql`
    select o.id, o.phone, o.email, o.code,
           to_char((o.expires_at - interval '10 minutes') at time zone 'UTC',
                   'YYYY-MM-DD HH24:MI:SS') as req_utc,
           to_char((o.expires_at - interval '10 minutes') at time zone 'America/Sao_Paulo',
                   'YYYY-MM-DD HH24:MI:SS') as req_brt,
           to_char(o.used_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as used_utc,
           u.id as user_id,
           to_char(u.last_login_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as last_login_utc
    from otp_codes o
    left join users u on u.phone = o.phone
    where o.expires_at > now() - interval '48 hours'
    order by o.expires_at asc
  `) as unknown as OtpRow[];

  if (!rows.length) {
    console.log("NENHUM pedido de código nas últimas 48h.");
    console.log("→ A requisição nem chegou ao insert: 400 invalid_phone (número");
    console.log("  reprovado por normalizePhone/isValidE164) ou erro 500 antes do insert.");
    return;
  }

  console.log(`${rows.length} pedido(s):\n`);
  for (const r of rows) {
    console.log(
      `#${r.id}  ${r.req_utc} UTC (${r.req_brt} BRT)  para=${r.phone ?? r.email ?? "-"}  ` +
        `código=${r.code}  usado=${r.used_utc ?? "NUNCA"}  ` +
        `conta=${r.user_id ?? "não existe"}  último login=${r.last_login_utc ?? "nunca"}`
    );
  }

  const nuncaUsados = rows.filter((r) => !r.used_utc);
  console.log(
    `\nresumo: ${rows.length} pedidos, ${nuncaUsados.length} nunca usados ` +
      `(código gerado mas ninguém conseguiu verificar → SMS não chegou).`
  );
}

type TwilioMessage = {
  sid: string;
  to: string;
  from: string;
  status: string;
  error_code: number | null;
  error_message: string | null;
  date_created: string;
  date_sent: string | null;
  body: string;
};

async function twilioAudit() {
  console.log("\n" + "=".repeat(78));
  console.log("2) TWILIO — últimas mensagens enviadas pelo número do app");
  console.log("=".repeat(78));

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    console.log("credenciais Twilio ausentes neste env — pulando.");
    return;
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const url =
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json` +
    `?From=${encodeURIComponent(from)}&PageSize=50`;

  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.log(`FALHA ao consultar o Twilio: HTTP ${res.status}`);
    console.log(text.slice(0, 600));
    console.log(
      "\n→ Se for 401: o auth token no Railway não confere com o da conta Twilio\n" +
        "  (o .env.production avisa que o token seria rotacionado). Isso sozinho\n" +
        "  explica 'erro ao enviar código' para TODO mundo, não só um usuário."
    );
    return;
  }

  const data = (await res.json()) as { messages: TwilioMessage[] };
  if (!data.messages?.length) {
    console.log("nenhuma mensagem no log do Twilio para esse número.");
    console.log("→ O app nunca conseguiu criar mensagem: falha de auth/saldo, ou");
    console.log("  a requisição foi recusada antes (400 no create).");
    return;
  }

  console.log(`${data.messages.length} mensagem(ns) mais recentes:\n`);
  for (const m of data.messages) {
    const err = m.error_code ? `  ERRO ${m.error_code}: ${m.error_message ?? ""}` : "";
    console.log(`${m.date_created}  para=${m.to}  status=${m.status}${err}`);
  }

  const falhas = data.messages.filter((m) => m.error_code || ["failed", "undelivered"].includes(m.status));
  console.log(`\nresumo: ${falhas.length} de ${data.messages.length} com erro/não entregue.`);
  if (falhas.length) {
    const codes = [...new Set(falhas.map((m) => m.error_code).filter(Boolean))];
    console.log(`códigos de erro distintos: ${codes.join(", ") || "(sem código — só status)"}`);
    console.log("referência: https://www.twilio.com/docs/api/errors/<código>");
  }
}

async function main() {
  await otpAudit();
  await twilioAudit();
  await rawSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
