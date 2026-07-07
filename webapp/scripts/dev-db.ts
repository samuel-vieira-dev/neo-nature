/* Local dev database: real Postgres via embedded-postgres (no Docker/sudo needed).
 * Usage: npm run db:start   (keeps running; Ctrl+C to stop)
 * Data lives in .pgdata/ (gitignored). Production uses Railway's DATABASE_URL. */
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), ".pgdata");

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: 5433,
    persistent: true,
  });

  if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log("[db] initialising cluster in .pgdata …");
    await pg.initialise();
  }

  await pg.start();
  console.log("[db] Postgres running on postgresql://postgres:postgres@127.0.0.1:5433/postgres");

  const stop = async () => {
    console.log("\n[db] stopping …");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
