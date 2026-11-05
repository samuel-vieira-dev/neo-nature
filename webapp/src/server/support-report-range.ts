import { z } from "zod";
import { zonedDay } from "@/lib/business-hours";
import type { ReportRange } from "./support-reports";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MAX_DAYS = 366;

/** ?from=&to= (inclusive days in the report time zone); defaults to the last 30 days. */
export function reportRangeFrom(url: string, now = new Date()): ReportRange {
  const params = new URL(url).searchParams;
  const to = day.safeParse(params.get("to")).data ?? zonedDay(now);
  const fallback = new Date(`${to}T12:00:00Z`);
  fallback.setUTCDate(fallback.getUTCDate() - 29);
  const from = day.safeParse(params.get("from")).data ?? fallback.toISOString().slice(0, 10);
  const span = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (!Number.isFinite(span) || span < 0 || span >= MAX_DAYS) throw Response.json({ error: "invalid_range" }, { status: 400 });
  return { from, to };
}
