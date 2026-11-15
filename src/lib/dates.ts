// Date helpers. Date-only values (menu days, task due dates) are stored as
// local "YYYY-MM-DD" strings; event times are PocketBase UTC datetimes.

export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return x;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** weekStartsOn: 0 = Sunday (calendar), 1 = Monday (meal plan) */
export function startOfWeek(d: Date, weekStartsOn = 0): Date {
  const x = startOfDay(d);
  const diff = (x.getDay() - weekStartsOn + 7) % 7;
  return addDays(x, -diff);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 864e5);
}

/** PocketBase datetime "2026-11-15 14:00:00.000Z" → Date */
export function fromPB(s: string | undefined | null): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

/** Date → PocketBase datetime string (UTC) */
export function toPB(d: Date): string {
  return d.toISOString().replace('T', ' ');
}

export function fmtTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${ap}`;
}

/** "3:30" without AM/PM, for compact week cards */
export function fmtTimeShort(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${pad(d.getMinutes())}`;
}

export function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function withTime(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const x = new Date(day);
  x.setHours(h || 0, m || 0, 0, 0);
  return x;
}

/** "Tuesday · October 27" */
export function fmtHeaderDate(d: Date): string {
  return `${DOW_LONG[d.getDay()]} · ${MON_LONG[d.getMonth()]} ${d.getDate()}`;
}

/** "Tue, Oct 27" */
export function fmtShortDate(d: Date): string {
  return `${DOW_SHORT[d.getDay()]}, ${MON_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** Relative-ish label used on tasks: Today, Tomorrow, Thu, Nov 15 */
export function fmtDue(due: string): string {
  if (!due) return 'Someday';
  const d = parseYmd(due);
  const n = daysBetween(today(), d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n < 0) return `${-n} days overdue`;
  if (n < 7) return DOW_LONG[d.getDay()];
  return `${DOW_SHORT[d.getDay()]}, ${MON_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

export function relativeAgo(d: Date | null): string {
  if (!d) return 'never';
  const days = daysBetween(d, new Date());
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} week${days < 11 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}
