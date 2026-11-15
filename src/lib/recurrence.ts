// Recurring events and chores, built on rrule.
//
// rrule works in UTC, so we convert local wall-clock times to "floating" UTC
// dates and back. That keeps "every Tuesday at 9:00" at 9:00 across DST.
import * as rr from 'rrule';
import { addDays, parseYmd, startOfDay, ymd } from './dates';

// rrule's ESM build has named exports (Vite); its CJS build (Node/Vitest) only a
// default. Pick whichever is there.
type RR = { RRule: typeof rr.RRule; rrulestr: typeof rr.rrulestr };
const mod: RR = (rr as unknown as RR).RRule ? (rr as unknown as RR) : (rr as unknown as { default: RR }).default;
const { RRule, rrulestr } = mod;

export const toFloating = (d: Date) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
export const fromFloating = (f: Date) =>
  new Date(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate(), f.getUTCHours(), f.getUTCMinutes(), f.getUTCSeconds());

function ruleFor(rrule: string, dtstart: Date) {
  const opts = RRule.parseString(rrule.replace(/^RRULE:/, ''));
  return new RRule({ ...opts, dtstart: toFloating(dtstart) });
}

export interface Occurrence<T> {
  source: T;
  start: Date;
  end: Date;
  /** YYYY-MM-DD of this occurrence; used for "skip just this one" */
  key: string;
}

export interface EventLike {
  start: Date;
  end: Date;
  rrule?: string;
  exdates?: string[] | null;
}

/** All occurrences of `events` that overlap [from, to). */
export function expand<T extends EventLike>(events: T[], from: Date, to: Date): Occurrence<T>[] {
  const out: Occurrence<T>[] = [];
  for (const ev of events) {
    const dur = Math.max(0, ev.end.getTime() - ev.start.getTime());
    if (!ev.rrule) {
      if (ev.start < to && new Date(ev.start.getTime() + Math.max(dur, 1)) > from) {
        out.push({ source: ev, start: ev.start, end: ev.end, key: ymd(ev.start) });
      }
      continue;
    }
    let rule;
    try {
      rule = ruleFor(ev.rrule, ev.start);
    } catch {
      continue;
    }
    const skip = new Set(ev.exdates || []);
    const between = rule.between(toFloating(new Date(from.getTime() - dur)), toFloating(to), true);
    for (const f of between) {
      const start = fromFloating(f);
      const key = ymd(start);
      if (skip.has(key)) continue;
      const end = new Date(start.getTime() + dur);
      if (start < to && new Date(start.getTime() + Math.max(dur, 1)) > from) out.push({ source: ev, start, end, key });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Next due date (YYYY-MM-DD) for a recurring chore that was just completed. */
export function nextDue(due: string, rrule: string, now = new Date()): string {
  const base = due ? parseYmd(due) : startOfDay(now);
  const rule = ruleFor(rrule, base);
  const after = startOfDay(base > now ? base : now);
  // strictly after max(due, today) so finishing early or late both land on the next slot
  const next = rule.after(toFloating(addDays(after, 0)), false);
  return next ? ymd(fromFloating(next)) : '';
}

/** Is a chore with this rule scheduled on `day` (used to show chores on the calendar)? */
export function occursOn(due: string, rrule: string, day: Date): boolean {
  if (!due) return false;
  if (!rrule) return due === ymd(day);
  try {
    const rule = ruleFor(rrule, parseYmd(due));
    // end is exclusive: the next midnight belongs to the next day
    const hits = rule.between(toFloating(startOfDay(day)), new Date(toFloating(addDays(startOfDay(day), 1)).getTime() - 1), true);
    return hits.length > 0 && parseYmd(due) <= day;
  } catch {
    return false;
  }
}

// ---------- the handful of repeat options the app offers ----------
export type RepeatId = 'never' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export const REPEATS: { id: RepeatId; label: string; rule: string }[] = [
  { id: 'never', label: 'Never', rule: '' },
  { id: 'daily', label: 'Every day', rule: 'FREQ=DAILY' },
  { id: 'weekdays', label: 'Every weekday', rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { id: 'weekly', label: 'Every week', rule: 'FREQ=WEEKLY' },
  { id: 'biweekly', label: 'Every 2 weeks', rule: 'FREQ=WEEKLY;INTERVAL=2' },
  { id: 'monthly', label: 'Every month', rule: 'FREQ=MONTHLY' },
  { id: 'quarterly', label: 'Every 3 months', rule: 'FREQ=MONTHLY;INTERVAL=3' },
  { id: 'yearly', label: 'Every year', rule: 'FREQ=YEARLY' },
];

export function repeatIdFor(rule: string | undefined): RepeatId {
  if (!rule) return 'never';
  const hit = REPEATS.find((r) => r.rule === rule.replace(/^RRULE:/, ''));
  return hit ? hit.id : 'weekly';
}

/** Human text: "Every Tuesday", "Every 3 months", "Weekdays" */
export function describeRule(rule: string | undefined, start?: Date): string {
  if (!rule) return '';
  const id = repeatIdFor(rule);
  const day = start ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][start.getDay()] : '';
  switch (id) {
    case 'weekly': return day ? `Every ${day}` : 'Every week';
    case 'weekdays': return 'Repeats weekdays';
    case 'biweekly': return day ? `Every other ${day}` : 'Every 2 weeks';
    default: {
      const r = REPEATS.find((x) => x.id === id);
      if (r && r.rule === rule) return r.label;
      try {
        return rrulestr(rule.startsWith('RRULE:') ? rule : 'RRULE:' + rule).toText();
      } catch {
        return 'Repeats';
      }
    }
  }
}
