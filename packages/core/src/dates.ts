/** 'YYYY-MM' helpers. Months are labels in the GROUP's timezone; the database does the boundary math. */
export function monthKey(d: Date = new Date(), timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${y}-${m}`;
}
export function shiftMonth(key: string, delta: number): string {
  const [y = 1970, m = 1] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
export const monthToDate = (key: string) => `${key}-01`;

/** value for <input type="datetime-local"> in the browser's local zone */
export function toLocalInput(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function localInputToIso(v: string): string {
  return new Date(v).toISOString();
}

/** How long after adding an expense it can still be edited. Must match the database (migration 0008). */
export const EDIT_WINDOW_MINUTES = 60;
export const EDIT_WINDOW_MS = EDIT_WINDOW_MINUTES * 60_000;
/** Milliseconds of edit time left (0 when the window is over). */
export function editWindowLeftMs(createdAtIso: string, now: number = Date.now()): number {
  const left = new Date(createdAtIso).getTime() + EDIT_WINDOW_MS - now;
  return left > 0 ? left : 0;
}
/** 'YYYY-MM-DD' for a Date in the given IANA time zone (or the browser's). */
export function dayKey(d: Date = new Date(), timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(d);
}
/** first and last day ('YYYY-MM-DD') of a 'YYYY-MM' month */
export function monthRange(key: string): { from: string; to: string } {
  const [y = 1970, m = 1] = key.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, '0')}` };
}
