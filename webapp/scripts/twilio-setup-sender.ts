/**
 * Sets the Twilio account up so login codes reach customers outside the US.
 *
 * Why: the app sends from one US long code (TWILIO_FROM_NUMBER). Several
 * countries — the UK first of all — refuse SMS from foreign long codes, and
 * Twilio reports 21612 "Message cannot be sent with the current combination of
 * To/From". The fix Twilio recommends is a Messaging Service whose sender pool
 * holds the US number AND an alphanumeric sender ("NeoNature"): per message,
 * Twilio picks a sender the destination country accepts. The app already
 * prefers TWILIO_MESSAGING_SERVICE_SID when set (src/server/sms.ts).
 *
 * What it does (idempotent — re-running changes nothing that's already there):
 *   1. finds the TWILIO_FROM_NUMBER among the account's phone numbers;
 *   2. reuses the Messaging Service that already contains it (a number can
 *      live in ONE service — US 10DLC campaigns pin it there), else reuses a
 *      service named "Neo Nature Login", else creates that service;
 *   3. makes sure the number and the alphanumeric sender are in the pool;
 *   4. prints the MG… SID to set as TWILIO_MESSAGING_SERVICE_SID on Railway.
 *
 * Dry run by default — prints the plan and calls only GETs.
 *
 * Usage:
 *   npx tsx --env-file=.env.production scripts/twilio-setup-sender.ts
 *   npx tsx --env-file=.env.production scripts/twilio-setup-sender.ts --apply
 *   npx tsx --env-file=.env.production scripts/twilio-setup-sender.ts --test=+447713480000
 *       (--test sends one real SMS through the service — use your own phone)
 *
 * Not automatable here (console only): SMS Geographic Permissions — every
 * country you sell to must be enabled at
 *   https://console.twilio.com/us1/develop/sms/settings/geo-permissions
 * (error 21408 on send = country not enabled).
 */
const apply = process.argv.includes("--apply");
const testTo = process.argv.find((a) => a.startsWith("--test="))?.split("=")[1];
const ALPHA = (process.env.TWILIO_ALPHA_SENDER_ID?.trim() || "NeoNature").slice(0, 11);
const SERVICE_NAME = "Neo Nature Login";

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_FROM_NUMBER?.trim();
if (!sid || !token || !from) {
  console.error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER must be set (run with --env-file=.env.production).");
  process.exit(1);
}
const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");

type Json = Record<string, unknown>;
async function call(method: "GET" | "POST", url: string, form?: Record<string, string>): Promise<Json> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    throw new Error(`${method} ${url} → ${res.status} code=${json.code ?? "?"}: ${json.message ?? JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}
const MSG = "https://messaging.twilio.com/v1";
const API = `https://api.twilio.com/2010-04-01/Accounts/${sid}`;

async function main() {
  console.log(`Twilio account ${sid!.slice(0, 6)}… · from=${from} · alpha sender="${ALPHA}" · ${apply ? "APPLYING" : "dry run"}\n`);

  // 1. the phone number resource
  const nums = (await call("GET", `${API}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(from!)}`)) as {
    incoming_phone_numbers?: { sid: string; phone_number: string; capabilities?: { sms?: boolean } }[];
  };
  const pn = nums.incoming_phone_numbers?.[0];
  if (!pn) {
    console.error(`✗ ${from} is not an IncomingPhoneNumber on this account (is it on a subaccount, or a short code?). Stopping.`);
    process.exit(1);
  }
  console.log(`✓ number ${pn.phone_number} = ${pn.sid} (sms capable: ${pn.capabilities?.sms !== false})`);

  // 2. which Messaging Service to use
  const services = ((await call("GET", `${MSG}/Services?PageSize=100`)) as { services?: { sid: string; friendly_name: string }[] }).services ?? [];
  let service: { sid: string; friendly_name: string } | undefined;
  for (const s of services) {
    const pool = ((await call("GET", `${MSG}/Services/${s.sid}/PhoneNumbers?PageSize=100`)) as { phone_numbers?: { sid: string }[] }).phone_numbers ?? [];
    if (pool.some((p) => p.sid === pn.sid)) {
      service = s;
      console.log(`✓ number already belongs to Messaging Service "${s.friendly_name}" (${s.sid}) — reusing it`);
      break;
    }
  }
  if (!service) service = services.find((s) => s.friendly_name === SERVICE_NAME);
  if (service && !services.some((s) => s.sid === service!.sid && s.friendly_name !== SERVICE_NAME)) {
    console.log(`✓ Messaging Service "${service.friendly_name}" (${service.sid}) exists`);
  }
  if (!service) {
    console.log(`• Messaging Service "${SERVICE_NAME}" will be created`);
    if (apply) {
      service = (await call("POST", `${MSG}/Services`, { FriendlyName: SERVICE_NAME })) as { sid: string; friendly_name: string };
      console.log(`✓ created ${service.sid}`);
    }
  }

  // 3. pool contents
  if (service) {
    const pool = ((await call("GET", `${MSG}/Services/${service.sid}/PhoneNumbers?PageSize=100`)) as { phone_numbers?: { sid: string }[] }).phone_numbers ?? [];
    if (pool.some((p) => p.sid === pn.sid)) console.log(`✓ number is in the pool`);
    else {
      console.log(`• number will be added to the pool`);
      if (apply) {
        await call("POST", `${MSG}/Services/${service.sid}/PhoneNumbers`, { PhoneNumberSid: pn.sid });
        console.log(`✓ number added`);
      }
    }
    const alphas = ((await call("GET", `${MSG}/Services/${service.sid}/AlphaSenders?PageSize=100`)) as { alpha_senders?: { alpha_sender: string }[] }).alpha_senders ?? [];
    if (alphas.some((a) => a.alpha_sender === ALPHA)) console.log(`✓ alpha sender "${ALPHA}" is in the pool`);
    else {
      console.log(`• alpha sender "${ALPHA}" will be added to the pool`);
      if (apply) {
        try {
          await call("POST", `${MSG}/Services/${service.sid}/AlphaSenders`, { AlphaSender: ALPHA });
          console.log(`✓ alpha sender added`);
        } catch (e) {
          console.error(`✗ could not add the alpha sender: ${(e as Error).message}`);
          console.error(
            "  → Alphanumeric Sender ID must be enabled on the account (Console → Messaging → Settings → Alphanumeric Sender ID).\n" +
              "    Some countries also need the sender pre-registered (Brazil, India, …) — the UK does not."
          );
        }
      }
    }
  }

  if (!apply) {
    console.log("\nDry run — nothing changed. Re-run with --apply to create/attach.");
  } else if (service) {
    console.log(`\nDONE. Set this on Railway (web service variables) and redeploy:\n\n  TWILIO_MESSAGING_SERVICE_SID=${service.sid}\n`);
    console.log("Then enable every destination country under SMS Geographic Permissions:");
    console.log("  https://console.twilio.com/us1/develop/sms/settings/geo-permissions");
  }

  if (testTo && service) {
    console.log(`\nSending a test SMS to ${testTo} through ${service.sid}…`);
    const r = (await call("POST", `${API}/Messages.json`, {
      To: testTo,
      MessagingServiceSid: service.sid,
      Body: "Neo Nature test: if you can read this, international login codes work.",
    })) as { sid?: string; status?: string };
    console.log(`queued ${r.sid} (status ${r.status}). Check delivery in Console → Monitor → Logs → Messaging.`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
