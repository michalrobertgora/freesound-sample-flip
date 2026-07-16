/** ISO-8601 week handling. Weeks start Monday; week 1 contains Jan 4. */

/** ISO week of a date, as "YYYY-Www" (e.g. "2026-W29"). Uses local date parts. */
export function isoWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // shift to the Thursday of this ISO week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function currentIsoWeek(): string {
  return isoWeekString(new Date());
}

const WEEK_RE = /^(\d{4})-W(\d{2})$/;

export function isValidIsoWeek(s: string): boolean {
  const m = WEEK_RE.exec(s);
  if (!m) return false;
  const week = Number(m[2]);
  return week >= 1 && week <= isoWeeksInYear(Number(m[1]));
}

/** 52 or 53, per the ISO rule (Jan 1 or Dec 31 of a leap year is a Thursday). */
export function isoWeeksInYear(year: number): number {
  const dow = (y: number) => new Date(Date.UTC(y, 0, 1)).getUTCDay();
  const jan1 = dow(year);
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return jan1 === 4 || (isLeap && jan1 === 3) ? 53 : 52;
}

/** Step an ISO week string forward/backward by `delta` weeks. */
export function shiftIsoWeek(week: string, delta: number): string {
  const m = WEEK_RE.exec(week);
  if (!m) throw new Error(`invalid ISO week: ${week}`);
  let [year, w] = [Number(m[1]), Number(m[2])];
  w += delta;
  while (w < 1) {
    year -= 1;
    w += isoWeeksInYear(year);
  }
  while (w > isoWeeksInYear(year)) {
    w -= isoWeeksInYear(year);
    year += 1;
  }
  return `${year}-W${String(w).padStart(2, "0")}`;
}
