/**
 * Business-hours clock for the support SLA ("24h úteis"): every hour of Monday–Friday counts,
 * weekends do not, in the US Eastern time zone (customers are in the US). No holidays yet.
 * DST changes happen on Sundays, so every business day is exactly 24 hours.
 */
export const REPORT_TIME_ZONE = "America/New_York";
export const SLA_BUSINESS_HOURS = 24;

const HOUR = 3_600_000;
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: REPORT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short" });

function zoned(t: number) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const [y, m, d] = [Number(p.year), Number(p.month), Number(p.day)];
  const offset = Date.UTC(y, m - 1, d, Number(p.hour), Number(p.minute), Number(p.second)) - (t - (((t % 1000) + 1000) % 1000));
  return { y, m, d, weekend: p.weekday === "Sat" || p.weekday === "Sun", offset };
}

/** UTC instant of 00:00 in the report time zone on that calendar date (day may overflow). */
function zonedMidnight(y: number, m: number, d: number): number {
  const guess = Date.UTC(y, m - 1, d);
  const t = guess - zoned(guess).offset;
  const corrected = zoned(t).offset;
  return guess - corrected;
}

/** "YYYY-MM-DD" → start of that day in the report time zone. */
export function zonedDayStart(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(zonedMidnight(y, m, d));
}

/** "YYYY-MM-DD" of an instant in the report time zone. */
export function zonedDay(at: Date): string {
  const { y, m, d } = zoned(at.getTime());
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Hours between two instants, counting only Monday–Friday in the report time zone. */
export function businessHoursBetween(start: Date, end: Date): number {
  let cursor = start.getTime();
  const stop = end.getTime();
  let ms = 0;
  while (cursor < stop) {
    const z = zoned(cursor);
    const next = Math.min(zonedMidnight(z.y, z.m, z.d + 1), stop);
    if (!z.weekend) ms += next - cursor;
    cursor = next;
  }
  return ms / HOUR;
}
