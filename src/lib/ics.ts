// Minimal iCalendar (.ics) reader for the one-time Google Calendar import.
// Handles folded lines, all-day and timed events, UTC/floating/TZID times,
// RRULE and EXDATE. Times with a TZID are read as local wall-clock time,
// which is right when the calendar and the household share a time zone.

export interface IcsEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  rrule: string;
  exdates: string[];
  location: string;
  notes: string;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function unescape(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseDate(value: string, params: string): { date: Date; allDay: boolean } {
  if (/VALUE=DATE(?!-)/i.test(params) || /^\d{8}$/.test(value)) {
    const y = +value.slice(0, 4), m = +value.slice(4, 6), d = +value.slice(6, 8);
    return { date: new Date(y, m - 1, d), allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return { date: new Date(NaN), allDay: false };
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymdLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseIcs(text: string): IcsEvent[] {
  const out: IcsEvent[] = [];
  let cur: Partial<IcsEvent> & { _end?: Date; _durMs?: number } | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      cur = { exdates: [], rrule: '', location: '', notes: '', title: '' };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur && cur.start && !isNaN(cur.start.getTime())) {
        const end = cur._end || new Date(cur.start.getTime() + (cur._durMs ?? (cur.allDay ? 864e5 : 3600e3)));
        out.push({ uid: cur.uid || '', title: cur.title || '(no title)', start: cur.start, end, allDay: !!cur.allDay, rrule: cur.rrule || '', exdates: cur.exdates || [], location: cur.location || '', notes: cur.notes || '' });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...rest] = head.split(';');
    const params = rest.join(';');
    switch (name.toUpperCase()) {
      case 'UID': cur.uid = value; break;
      case 'SUMMARY': cur.title = unescape(value); break;
      case 'LOCATION': cur.location = unescape(value); break;
      case 'DESCRIPTION': cur.notes = unescape(value).slice(0, 2000); break;
      case 'DTSTART': { const p = parseDate(value, params); cur.start = p.date; cur.allDay = p.allDay; break; }
      case 'DTEND': cur._end = parseDate(value, params).date; break;
      case 'DURATION': {
        const m = value.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
        if (m) cur._durMs = ((+(m[1] || 0) * 7 + +(m[2] || 0)) * 24 * 60 + +(m[3] || 0) * 60 + +(m[4] || 0)) * 60e3;
        break;
      }
      case 'RRULE': cur.rrule = value.replace(/;?UNTIL=(\d{8})(T\d{6}Z?)?/, (_m, d) => `;UNTIL=${d}T235959Z`).replace(/^;/, ''); break;
      case 'EXDATE':
        for (const v of value.split(',')) {
          const d = parseDate(v, params).date;
          if (!isNaN(d.getTime())) cur.exdates!.push(ymdLocal(d));
        }
        break;
    }
  }
  return out;
}
