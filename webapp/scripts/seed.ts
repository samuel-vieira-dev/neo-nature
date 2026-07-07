/* CLI wrapper — the actual seed logic lives in src/server/seed-core.ts
 * (shared with the demo panel's "Reset demo data" API). */
import { seedAll } from "../src/server/seed-core";
import { rawSql } from "../src/db";

seedAll()
  .then(async () => {
    await rawSql.end();
  })
  .catch(async (e) => {
    console.error(e);
    await rawSql.end();
    process.exit(1);
  });
