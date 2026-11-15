// Full event form (Checkpoint A): create and edit events, repeats, who,
// reminders, location and notes. Opening a repeating event from one of its
// dates also offers "skip just this date".
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { add, patch, remove, useRecord } from '../../lib/sync';
import { addDays, fmtShortDate, fromPB, hhmm, parseYmd, toPB, today, withTime, ymd } from '../../lib/dates';
import { describeRule, REPEATS, repeatIdFor, type RepeatId } from '../../lib/recurrence';
import { BackLink, ChipGroup, Confirm, Screen, useGoBack, useMembers, useToast } from '../../shared/ui';
import type { CalEvent } from '../../lib/types';

const REMINDERS = [
  { value: -1, label: 'None' },
  { value: 0, label: 'At start time' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
];

interface Form {
  title: string;
  date: string;
  endDate: string;
  allDay: boolean;
  start: string;
  end: string;
  repeat: RepeatId;
  owner: string;
  reminder: number;
  location: string;
  notes: string;
}

export function EventEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const occurrence = params.get('on');
  const goBack = useGoBack('/calendar');
  const toast = useToast();
  const existing = useRecord('events', id);
  const members = useMembers();
  const initialDate = params.get('date') || ymd(today());
  const [f, setF] = useState<Form>({
    title: '', date: initialDate, endDate: initialDate, allDay: false, start: '09:00', end: '10:00',
    repeat: 'never', owner: members.me?.id || '', reminder: 60, location: '', notes: '',
  });
  const [loaded, setLoaded] = useState(!id);
  const [confirm, setConfirm] = useState<null | 'series' | 'one'>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!existing || loaded) return;
    const s = fromPB(existing.start)!;
    const e = fromPB(existing.end) || new Date(s.getTime() + 3600e3);
    const lastDay = existing.all_day ? addDays(e, -1) : e;
    setF({
      title: existing.title,
      date: ymd(s),
      endDate: ymd(lastDay < s ? s : lastDay),
      allDay: existing.all_day,
      start: existing.all_day ? '09:00' : hhmm(s),
      end: existing.all_day ? '10:00' : hhmm(e),
      repeat: repeatIdFor(existing.rrule),
      owner: existing.owner || '',
      reminder: existing.reminder_min ?? -1,
      location: existing.location || '',
      notes: existing.notes || '',
    });
    setLoaded(true);
  }, [existing, loaded]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  function setStart(v: string) {
    // keep the same length when the start moves
    const oldS = withTime(new Date(), f.start), oldE = withTime(new Date(), f.end);
    const dur = Math.max(15 * 60e3, oldE.getTime() - oldS.getTime());
    const ns = withTime(new Date(), v);
    setF((x) => ({ ...x, start: v, end: hhmm(new Date(ns.getTime() + dur)) }));
  }

  async function save() {
    setError('');
    if (!f.title.trim()) return setError('Give the event a name.');
    const day = parseYmd(f.date);
    let start: Date, end: Date;
    if (f.allDay) {
      start = day;
      const last = parseYmd(f.endDate < f.date ? f.date : f.endDate);
      end = addDays(last, 1);
    } else {
      start = withTime(day, f.start);
      end = withTime(day, f.end);
      if (end <= start) end = addDays(end, 1); // e.g. 11 PM – 1 AM
    }
    const data: Partial<CalEvent> = {
      title: f.title.trim(),
      start: toPB(start),
      end: toPB(end),
      all_day: f.allDay,
      rrule: REPEATS.find((r) => r.id === f.repeat)!.rule,
      owner: f.owner,
      reminder_min: f.allDay ? -1 : f.reminder,
      location: f.location.trim(),
      notes: f.notes.trim(),
    };
    if (id) await patch('events', id, data);
    else await add('events', { ...data, exdates: [] } as Omit<CalEvent, 'id' | 'household'>);
    toast({ text: id ? 'Event saved' : `Added ${f.title.trim()}` });
    goBack();
  }

  async function skipOne() {
    if (!existing || !occurrence) return;
    await patch('events', existing.id, { exdates: [...(existing.exdates || []), occurrence] });
    toast({ text: `Skipped ${fmtShortDate(parseYmd(occurrence))}` });
    goBack();
  }

  async function deleteAll() {
    await remove('events', id!);
    toast({ text: 'Event deleted' });
    goBack();
  }

  if (id && existing === null) return <Screen fab={false} header={<BackLink />}><p className="empty">That event was deleted.</p></Screen>;

  const repeating = !!existing?.rrule;
  const whoOpts = [...members.list.map((u) => ({ value: u.id, label: u.name, dot: u.color })), { value: '', label: 'Family', dot: 'var(--teal)' }];

  return (
    <Screen
      fab={false}
      header={
        <>
          <div className="header-row">
            <BackLink />
            <button type="button" className="btn btn-primary btn-sm" onClick={save}>Save</button>
          </div>
          <h1 className="display h1">{id ? 'Edit event' : 'New event'}</h1>
          {repeating && <p className="small muted" style={{ margin: 0 }}>{describeRule(existing!.rrule, fromPB(existing!.start)!)} · changes apply to every date</p>}
        </>
      }
    >
      <div className="glass card" style={{ gap: 14 }}>
        <label className="field">
          Event
          <input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Pediatrician check-up" autoFocus={!id} />
        </label>
        <label className="row" style={{ borderBottom: 'none', minHeight: 36 }}>
          <input type="checkbox" checked={f.allDay} onChange={(e) => set('allDay', e.target.checked)} />
          All day
        </label>
        <div className="field-row">
          <label className="field">
            {f.allDay ? 'From' : 'Date'}
            <input type="date" value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value, endDate: x.endDate < e.target.value ? e.target.value : x.endDate }))} />
          </label>
          {f.allDay && (
            <label className="field">
              Through
              <input type="date" value={f.endDate} min={f.date} onChange={(e) => set('endDate', e.target.value)} />
            </label>
          )}
        </div>
        {!f.allDay && (
          <div className="field-row">
            <label className="field">Starts<input type="time" value={f.start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="field">Ends<input type="time" value={f.end} onChange={(e) => set('end', e.target.value)} /></label>
          </div>
        )}
        <label className="field">
          Repeats
          <select value={f.repeat} onChange={(e) => set('repeat', e.target.value as RepeatId)}>
            {REPEATS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <div className="field">
          <span>Who</span>
          <ChipGroup label="Who" value={f.owner} onChange={(v) => set('owner', v)} options={whoOpts} />
        </div>
        {!f.allDay && (
          <label className="field">
            Reminder
            <select value={f.reminder} onChange={(e) => set('reminder', Number(e.target.value))}>
              {REMINDERS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          Where (optional)
          <input value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Dr. office, 2nd floor" />
        </label>
        <label className="field">
          Notes
          <textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </label>
        {error && <p role="alert" style={{ margin: 0, color: 'var(--danger)' }}>{error}</p>}
      </div>

      {id && repeating && occurrence && confirm !== 'one' && (
        <button type="button" className="btn btn-ghost" onClick={() => setConfirm('one')}>Skip just {fmtShortDate(parseYmd(occurrence))}</button>
      )}
      {confirm === 'one' && <Confirm text={`Skip ${f.title} on ${fmtShortDate(parseYmd(occurrence!))}? Other dates stay.`} confirmLabel="Skip it" onCancel={() => setConfirm(null)} onConfirm={skipOne} />}
      {id && confirm !== 'series' && (
        <button type="button" className="btn btn-danger" onClick={() => setConfirm('series')}>{repeating ? 'Delete every date' : 'Delete event'}</button>
      )}
      {confirm === 'series' && <Confirm text={repeating ? `Delete ${f.title} on every date?` : `Delete ${f.title}?`} onCancel={() => setConfirm(null)} onConfirm={deleteAll} />}
    </Screen>
  );
}
