import { describe, expect, it } from 'vitest';
import { parseIcs } from '../../src/lib/ics';

const sample = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:abc@google.com',
  'SUMMARY:Dentist\\, Dr. Lee',
  'DTSTART;TZID=America/New_York:20261030T150000',
  'DTEND;TZID=America/New_York:20261030T160000',
  'LOCATION:Main St',
  'DESCRIPTION:Bring insurance\\ncard',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:bday@google.com',
  'SUMMARY:Grandma birthday',
  'DTSTART;VALUE=DATE:20261112',
  'DTEND;VALUE=DATE:20261113',
  'RRULE:FREQ=YEARLY',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:yoga@google.com',
  'SUMMARY:Yoga',
  'DTSTART:20261005T130000Z',
  'DURATION:PT1H',
  'RRULE:FREQ=WEEKLY;UNTIL=20261231T045959Z',
  'EXDATE:20261019T130000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('ics import', () => {
  const ev = parseIcs(sample);
  it('reads timed, all-day and repeating events', () => {
    expect(ev).toHaveLength(3);
    expect(ev[0]).toMatchObject({ uid: 'abc@google.com', title: 'Dentist, Dr. Lee', allDay: false, location: 'Main St', notes: 'Bring insurance\ncard' });
    expect(ev[0].start.getHours()).toBe(15);
    expect(ev[0].end.getTime() - ev[0].start.getTime()).toBe(3600e3);
    expect(ev[1]).toMatchObject({ allDay: true, rrule: 'FREQ=YEARLY' });
    expect(ev[1].start.getDate()).toBe(12);
  });
  it('handles UTC times, durations, UNTIL and EXDATE', () => {
    expect(ev[2].start.toISOString()).toBe('2026-10-05T13:00:00.000Z');
    expect(ev[2].end.getTime() - ev[2].start.getTime()).toBe(3600e3);
    expect(ev[2].rrule).toBe('FREQ=WEEKLY;UNTIL=20261231T235959Z');
    expect(ev[2].exdates).toHaveLength(1);
  });
  it('unfolds long lines', () => {
    const folded = 'BEGIN:VEVENT\r\nUID:x\r\nSUMMARY:A very long\r\n  title\r\nDTSTART:20261101T100000Z\r\nEND:VEVENT';
    expect(parseIcs(folded)[0].title).toBe('A very long title');
  });
});
