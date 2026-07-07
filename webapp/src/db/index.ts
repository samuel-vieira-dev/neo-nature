import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5433/postgres";

// Reuse the connection across HMR reloads in dev
const globalForDb = globalThis as unknown as { __nnSql?: ReturnType<typeof postgres> };

const sql =
  globalForDb.__nnSql ??
  postgres(url, {
    max: 10,
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== "production") globalForDb.__nnSql = sql;

export const db = drizzle(sql, { schema });
export const rawSql = sql;
export { schema };
