/**
 * Shared, cached number and date formatters. `toLocaleString` / `toLocaleDateString` with options build a
 * new Intl formatter on every call (tens of microseconds each); several of these run on every animation
 * frame while time plays, so each format is built once here and reused.
 */
const dayMonth = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const monthShort = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short' });
const longDateTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** "8 Jul" (UTC). */
export const fmtDayMonth = (t: number) => dayMonth.format(t);
/** "Jul" (UTC). */
export const fmtMonth = (t: number) => monthShort.format(t);
/** "8 July 2027, 04:10" (UTC). */
export const fmtLongDateTime = (t: number) => longDateTime.format(t);
/** "12,345" with thousands separators, rounded to a whole number. */
export const fmtInt = (x: number) => int.format(Math.round(x));
