// One-time imports: Cozi shopping lists (pasted text) and Google Calendar (.ics file).
import { useMemo, useState } from 'react';
import { add, useRecords } from '../../lib/sync';
import { addToList } from '../../lib/actions';
import { parseListItem } from '../../lib/parse';
import { parseIcs, type IcsEvent } from '../../lib/ics';
import { fmtShortDate, toPB, today } from '../../lib/dates';
import { BackLink, ChipGroup, Screen, useToast } from '../../shared/ui';
import type { CalEvent } from '../../lib/types';

export function ImportScreen() {
  return (
    <Screen fab={false} header={<><BackLink to="/settings" /><h1 className="display h1">Import</h1></>}>
      <CoziImport />
      <IcsImport />
    </Screen>
  );
}

function CoziImport() {
  const lists = useRecords('lists');
  const sorted = useMemo(() => (lists || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), [lists]);
  const [text, setText] = useState('');
  const [listId, setListId] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const target = listId || sorted[0]?.id || '';
  const lines = text.split('\n').map((l) => l.replace(/^[\s\-•*☐□✓✔\[\]x]+/i, '').trim()).filter(Boolean);

  async function run() {
    setBusy(true);
    for (const l of lines) await addToList(target, parseListItem(l));
    setBusy(false);
    setText('');
    toast({ text: `Imported ${lines.length} item${lines.length === 1 ? '' : 's'}` });
  }

  return (
    <section className="glass card" style={{ gap: 12 }}>
      <h2 className="label">Cozi shopping list</h2>
      <ol className="small muted" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
        <li>In Cozi, open the list and use Share (or Email list) to copy it.</li>
        <li>Paste it below. Each line becomes an item; quantities like "Milk 2 gal" are understood.</li>
        <li>Pick which Family Hub list it goes to. Repeat for each Cozi list.</li>
      </ol>
      <textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Milk 2 gal\nBananas\nDiapers size 3'} aria-label="Pasted list" />
      <ChipGroup label="Import into" value={target} onChange={setListId} options={sorted.map((l) => ({ value: l.id, label: l.name }))} scroll />
      <button type="button" className="btn btn-primary" disabled={!lines.length || !target || busy} onClick={run}>
        {busy ? 'Importing…' : `Import ${lines.length || ''} item${lines.length === 1 ? '' : 's'}`}
      </button>
    </section>
  );
}

function IcsImport() {
  const existing = useRecords('events');
  const [events, setEvents] = useState<IcsEvent[] | null>(null);
  const [range, setRange] = useState<'future' | 'all'>('future');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const known = useMemo(() => new Set((existing || []).map((e) => e.external_id).filter(Boolean)), [existing]);
  const picked = useMemo(() => {
    if (!events) return [];
    const t0 = today();
    return events.filter((e) => !known.has(e.uid) && (range === 'all' || e.rrule || e.end >= t0));
  }, [events, range, known]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setEvents(parseIcs(await f.text()));
  }

  async function run() {
    setBusy(true);
    for (const e of picked) {
      await add('events', {
        title: e.title, start: toPB(e.start), end: toPB(e.end), all_day: e.allDay, rrule: e.rrule, exdates: e.exdates,
        owner: '', reminder_min: -1, location: e.location, notes: e.notes, external_id: e.uid,
      } as Omit<CalEvent, 'id' | 'household'>);
    }
    setBusy(false);
    toast({ text: `Imported ${picked.length} event${picked.length === 1 ? '' : 's'}` });
    setEvents(null);
  }

  return (
    <section className="glass card" style={{ gap: 12 }}>
      <h2 className="label">Google Calendar</h2>
      <ol className="small muted" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
        <li>On a computer, open Google Calendar → Settings → Import &amp; export → Export. It downloads a .zip.</li>
        <li>Unzip it and pick the .ics file for the calendar you want here.</li>
        <li>Events come in as "Family"; open any event to set who it belongs to. Re-importing skips ones already here.</li>
      </ol>
      <label className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        Choose .ics file
        <input type="file" accept=".ics,text/calendar" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {events && (
        <>
          <ChipGroup label="Which events" value={range} onChange={setRange} options={[{ value: 'future', label: 'Upcoming + repeating' }, { value: 'all', label: 'Everything' }]} />
          <p className="small" style={{ margin: 0 }}>
            Found {events.length} event{events.length === 1 ? '' : 's'}; {picked.length} will be imported
            {events.length - picked.length ? ` (${events.length - picked.length} skipped)` : ''}.
          </p>
          {picked.slice(0, 5).map((e, i) => (
            <div key={i} className="small muted">{fmtShortDate(e.start)} · {e.title}{e.rrule ? ' · repeats' : ''}</div>
          ))}
          <button type="button" className="btn btn-primary" disabled={!picked.length || busy} onClick={run}>{busy ? 'Importing…' : `Import ${picked.length} events`}</button>
        </>
      )}
    </section>
  );
}
