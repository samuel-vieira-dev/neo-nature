/* Generates .env.local with random secrets + VAPID keys (run once). */
import fs from "node:fs";
import crypto from "node:crypto";
import webpush from "web-push";

const file = ".env.local";
if (fs.existsSync(file)) {
  console.log(`[env] ${file} already exists — leaving it untouched.`);
  process.exit(0);
}

const vapid = webpush.generateVAPIDKeys();

const contents = `# Local development environment (gitignored) — production values go in Railway
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres
SESSION_SECRET=${crypto.randomBytes(32).toString("hex")}
JOB_KEY=${crypto.randomBytes(16).toString("hex")}
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}
# ANTHROPIC_API_KEY=   # optional — enables AI FAQ search
`;

fs.writeFileSync(file, contents);
console.log(`[env] wrote ${file}`);
