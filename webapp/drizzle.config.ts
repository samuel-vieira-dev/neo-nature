import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load prod credentials only when explicitly targeting production
// (npm run db:push:prod sets DRIZZLE_ENV=production).
if (process.env.DRIZZLE_ENV === "production") {
  config({ path: ".env.production" });
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5433/postgres",
  },
});
