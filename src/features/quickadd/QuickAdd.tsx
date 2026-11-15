// Quick add sheet (mockup: Quick add · night): List item · Task · Event · Meal.
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams, type Location } from 'react-router';
import { add, useRecords } from '../../lib/sync';
import { addMissingForRecipe, addToList } from '../../lib/actions';
import { parseEventText, parseListItem } from '../../lib/parse';
import { REPEATS, type RepeatId } from '../../lib/recurrence';
import { addDays, DOW_SHORT, fmtShortDate, hhmm, startOfWeek, toPB, today, withTime, ymd } from '../../lib/dates';
import { fmtListQty } from '../../lib/units';
import { ChipGroup, Sheet, Stepper, useGoBack, useMembers, useToast } from '../../shared/ui';
import type { CalEvent, MenuEntry, Slot, Task } from '../../lib/types';

type Kind = 'item' | 'task' | 'event' | 'meal';
const TABS: { value: Kind; label: string; save: string }[] = [
  { value: 'item', label: 'List item', save: 'Add to list' },
  { value: 'task', label: 'Task', save: 'Add task' },
  { value: 'event', label: 'Event', save: 'Add to calendar' },
  { value: 'meal', label: 'Meal', save: 'Add to menu' },
];

/** Which tab to open on, based on the screen the ✦ button was tapped from. */
export function kindForPath(path: string): Kind {
  if (/^\/calendar/.test(path)) return 'event';
  if (/^\/(home\/tasks|tasks)/.test(path)) return 'task';
  if (/^\/(meals|recipes)/.test(path)) return 'meal';
  return 'item';
}

export function QuickAdd() {
  const [params] = useSearchParams();
  const bg = (useLocation().state as { bg?: Location } | null)?.bg;
  const from = bg?.pathname || '/';
  const [kind, setKind] = useState<Kind>((params.get('type') as Kind) || kindForPath(from));
  // context from the screen underneath: the list you're viewing, the calendar day you picked
  const listMatch = from.match(/^\/lists\/([^/]+)/);
  const fromList = listMatch && listMatch[1] !== 'manage' ? listMatch[1] : '';
  const fromDay = new URLSearchParams(bg?.search || '').get('d') || '';
  const close = useGoBack('/');
  const toast = useToast();

  const [saving, setSaving] = useState(false);
  const [saveFn, setSaveFn] = useState<{ fn: () => Promise<string | void>; ok: boolean }>({ fn: async () => {}, ok: false });

  async function save() {
    if (!saveFn.ok) return;
    setSaving(true);
    try {
      const msg = await saveFn.fn();
      if (msg) toast({ text: msg });
      close();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      title="Quick add"
      onClose={close}
      footer={
        <button type="button" className="btn btn-primary btn-block" disabled={!saveFn.ok || saving} onClick={save}>
          {TABS.find((t) => t.value === kind)!.save}
        </button>
      }
    >
      <div className="seg glass" role="tablist" aria-label="What to add">
        {TABS.map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={t.value === kind} className={t.value === kind ? 'on' : ''} onClick={() => setKind(t.value)}>
            {t.label}
          </button>
        ))}
      </div>
      {kind === 'item' && <ItemForm onReady={setSaveFn} defaultList={fromList} />}
      {kind === 'task' && <TaskForm onReady={setSaveFn} />}
      {kind === 'event' && <EventForm onReady={setSaveFn} defaultDate={fromDay} />}
      {kind === 'meal' && <MealForm onReady={setSaveFn} defaultDate={fromDay} />}
    </Sheet>
  );
}

type Ready = (s: { fn: () => Promise<string | void>; ok: boolean }) => void;

/** Re-register the save handler whenever the form's inputs change. */
function useReady(onReady: Ready, ok: boolean, fn: () => Promise<string | void>, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onReady({ fn, ok }), deps);
}

// ---------- list item ----------
function ItemForm({ onReady, defaultList = '' }: { onReady: Ready; defaultList?: string }) {
  const lists = useRecords('lists');
  const rows = useRecords('list_items');
  const sorted = useMemo(() => (lists || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), [lists]);
  const [text, setText] = useState('');
  const [listId, setListId] = useState(defaultList);
  const target = listId || sorted[0]?.id || '';
  const p = text.trim() ? parseListItem(text) : null;
  const recent = useMemo(() => {
    const seen = new Set<string>();
    return (rows || [])
      .slice()
      .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))
      .filter((r) => (seen.has(r.name.toLowerCase()) ? false : (seen.add(r.name.toLowerCase()), true)))
      .slice(0, 6);
  }, [rows]);

  useReady(onReady, !!p && !!target, async () => {
    await addToList(target, p!);
    return `Added ${p!.name} to ${sorted.find((l) => l.id === target)?.name}`;
  }, [text, target]);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <label className="field">
        What do you need?
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Milk 2 gal" autoFocus />
      </label>
      {p && <p className="small" style={{ margin: 0, color: 'var(--teal)' }}>Understood: {p.name}{p.qty !== 1 || p.unit ? ` · ${fmtListQty(p.qty, p.unit)}` : ''} · {p.category}</p>}
      <div className="field">
        <span>Add to</span>
        <ChipGroup label="Add to" value={target} onChange={setListId} options={sorted.map((l) => ({ value: l.id, label: l.name }))} scroll />
      </div>
      {recent.length > 0 && (
        <div className="field">
          <span>Recent</span>
          <div className="chips">
            {recent.map((r) => <button key={r.id} type="button" className="chip" onClick={() => setText(r.name)}>{r.name}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- task ----------
function TaskForm({ onReady }: { onReady: Ready }) {
  const members = useMembers();
  const [title, setTitle] = useState('');
  const [who, setWho] = useState(members.me?.id || '');
  const [when, setWhen] = useState<'today' | 'week' | 'pick' | 'someday'>('today');
  const [date, setDate] = useState(ymd(today()));
  const [repeat, setRepeat] = useState<RepeatId>('never');
  const due = when === 'today' ? ymd(today()) : when === 'week' ? ymd(addDays(startOfWeek(today(), 1), 6)) : when === 'pick' ? date : '';

  useReady(onReady, !!title.trim(), async () => {
    await add('tasks', { title: title.trim(), assignee: who, due, rrule: REPEATS.find((r) => r.id === repeat)!.rule, done: false, remind: true } as Omit<Task, 'id' | 'household'>);
    return `Added task: ${title.trim()}`;
  }, [title, who, due, repeat]);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <label className="field">
        Task
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Schedule furnace service" autoFocus />
      </label>
      <div className="field">
        <span>Who</span>
        <ChipGroup label="Who" value={who} onChange={setWho} options={[...members.list.map((u) => ({ value: u.id, label: u.name })), { value: '', label: 'Anyone' }]} />
      </div>
      <div className="field">
        <span>Due</span>
        <ChipGroup label="Due" value={when} onChange={setWhen} options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }, { value: 'pick', label: 'Pick date' }, { value: 'someday', label: 'Someday' }]} />
        {when === 'pick' && <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />}
      </div>
      <label className="field">
        Repeats
        <select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatId)}>
          {REPEATS.filter((r) => r.id !== 'weekdays').map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </label>
    </div>
  );
}

// ---------- event ----------
const REMINDERS = [
  { value: '-1', label: 'None' },
  { value: '15', label: '15 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
];

function EventForm({ onReady, defaultDate = '' }: { onReady: Ready; defaultDate?: string }) {
  const members = useMembers();
  const [text, setText] = useState('');
  const people = useMemo(() => members.list.map((u) => ({ id: u.id, name: u.name })), [members.list]);
  const parsed = parseEventText(text, new Date(), people);
  // Fields the person changed by hand win over what was understood from the text.
  const [startT, setStartT] = useState<string | null>(null);
  const [endT, setEndT] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [ownerPick, setOwner] = useState<string | null>(null);
  const [reminder, setReminder] = useState('60');
  const date = day || (parsed.date ? ymd(parsed.date) : defaultDate || ymd(today()));
  const start = startT || parsed.time || '';
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  // length from the text ("4 to 6pm" = 2 h), else 1 hour; moving the start keeps the length
  const lengthMin = parsed.time && parsed.end ? (mins(parsed.end) - mins(parsed.time) + 1440) % 1440 || 60 : 60;
  const end = endT || (start ? hhmm(new Date(withTime(new Date(), start).getTime() + lengthMin * 60e3)) : '');
  const owner = ownerPick ?? parsed.owner ?? '';
  const allDay = !start;

  useReady(onReady, !!parsed.title, async () => {
    const d = new Date(date + 'T00:00');
    const s = allDay ? d : withTime(d, start);
    const e = allDay ? addDays(d, 1) : withTime(d, end || start);
    await add('events', {
      title: parsed.title, start: toPB(s), end: toPB(e < s ? new Date(s.getTime() + 3600e3) : e), all_day: allDay,
      owner, reminder_min: allDay ? -1 : Number(reminder), rrule: '', exdates: [],
    } as Omit<CalEvent, 'id' | 'household'>);
    return `Added ${parsed.title} · ${fmtShortDate(d)}`;
  }, [text, date, start, end, owner, reminder]);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <label className="field">
        Event
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Dentist Fri 3pm" autoFocus />
      </label>
      {parsed.title && (
        <p className="small" style={{ margin: 0, color: 'var(--teal)' }}>
          Understood: {parsed.title} · {fmtShortDate(new Date(date + 'T00:00'))} · {allDay ? 'all day' : `${fmt12(start)}–${fmt12(end)}`} · {members.name(owner, 'Family')}
        </p>
      )}
      <label className="field">
        Date
        <input type="date" value={date} onChange={(e) => setDay(e.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">Starts<input type="time" value={start} onChange={(e) => {
          const v = e.target.value;
          // keep the event's length when the start moves
          if (endT && start && v) {
            const shifted = (mins(endT) + mins(v) - mins(start) + 1440) % 1440;
            setEndT(`${String(Math.floor(shifted / 60)).padStart(2, '0')}:${String(shifted % 60).padStart(2, '0')}`);
          }
          setStartT(v);
        }} /></label>
        <label className="field">Ends<input type="time" value={end} onChange={(e) => setEndT(e.target.value)} /></label>
      </div>
      <div className="field">
        <span>Who</span>
        <ChipGroup label="Who" value={owner} onChange={setOwner} options={[...members.list.map((u) => ({ value: u.id, label: u.name })), { value: '', label: 'Family' }]} />
      </div>
      <label className="field">
        Reminder
        <select value={allDay ? '-1' : reminder} disabled={allDay} onChange={(e) => setReminder(e.target.value)}>
          {REMINDERS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>
      <Link to="/calendar/new" replace className="small">Repeats, location or notes? Use the full event form ›</Link>
    </div>
  );
}

const fmt12 = (t: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

// ---------- meal ----------
function MealForm({ onReady, defaultDate = '' }: { onReady: Ready; defaultDate?: string }) {
  const recipes = useRecords('recipes');
  const sortedRecipes = useMemo(() => (recipes || []).slice().sort((a, b) => a.title.localeCompare(b.title)), [recipes]);
  const [choice, setChoice] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState(defaultDate || ymd(today()));
  const [slot, setSlot] = useState<Slot>('dinner');
  const [adults, setAdults] = useState(2);
  const [kids, setKids] = useState(1);
  const [addMissing, setAddMissing] = useState(true);
  const [showPeople, setShowPeople] = useState(false);
  const pick = choice || sortedRecipes[0]?.id || '__left';
  const isRecipe = !pick.startsWith('__');
  const recipe = sortedRecipes.find((r) => r.id === pick);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i));

  useReady(onReady, isRecipe ? !!recipe : true, async () => {
    const text = pick === '__left' ? 'Leftovers' : pick === '__out' ? 'Eating out' : '';
    await add('menu_entries', { date, slot, recipe: isRecipe ? pick : '', text, note: desc.trim(), adults, kids } as Omit<MenuEntry, 'id' | 'household'>);
    let n = 0;
    if (isRecipe && addMissing) n = await addMissingForRecipe(pick, adults + kids * (recipe?.kid_portion ?? 0.5));
    return `Added to the menu${n ? ` · ${n} item${n === 1 ? '' : 's'} to Grocery` : ''}`;
  }, [pick, desc, date, slot, adults, kids, addMissing]);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <label className="field">
        Recipe from Our Cookbook
        <select value={pick} onChange={(e) => setChoice(e.target.value)}>
          {sortedRecipes.length > 0 && (
            <optgroup label="Our Cookbook">
              {sortedRecipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </optgroup>
          )}
          <optgroup label="Other">
            <option value="__left">Leftovers</option>
            <option value="__out">Eating out</option>
          </optgroup>
        </select>
      </label>
      {!isRecipe && (
        <label className="field">
          {pick === '__left' ? 'Which leftovers?' : 'Where are you eating?'}
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={pick === '__left' ? 'e.g. Turkey chili from Monday' : 'e.g. restaurant, 6:30 PM'} />
        </label>
      )}
      {isRecipe && <Link to="/recipes/new" className="small">Not in the cookbook? Add a recipe ›</Link>}
      <div className="field">
        <span>When</span>
        <div className="chips scroll">
          {days.map((d) => (
            <button key={ymd(d)} type="button" className="chip" aria-pressed={ymd(d) === date} onClick={() => setDate(ymd(d))}>
              {DOW_SHORT[d.getDay()]} {d.getDate()}
            </button>
          ))}
        </div>
        <ChipGroup<Slot> label="Meal" value={slot} onChange={setSlot} options={[{ value: 'breakfast', label: 'Breakfast' }, { value: 'lunch', label: 'Lunch' }, { value: 'dinner', label: 'Dinner' }]} />
      </div>
      {isRecipe && (
        <div className="glass card" style={{ padding: 14 }}>
          <p className="small" style={{ margin: 0 }}>
            For {adults} adult{adults === 1 ? '' : 's'} + {kids} kid{kids === 1 ? '' : 's'} ·{' '}
            <button type="button" className="link-btn" onClick={() => setShowPeople(!showPeople)}>{showPeople ? 'done' : 'change'}</button>
          </p>
          {showPeople && (
            <div className="spread" style={{ alignItems: 'center' }}>
              <span>Adults</span><Stepper label="adults" value={adults} onChange={setAdults} />
              <span>Kids</span><Stepper label="kids" value={kids} onChange={setKids} />
            </div>
          )}
          <label className="row" style={{ borderBottom: 'none', minHeight: 36 }}>
            <input type="checkbox" checked={addMissing} onChange={(e) => setAddMissing(e.target.checked)} />
            Add missing ingredients to Grocery
          </label>
        </div>
      )}
    </div>
  );
}
