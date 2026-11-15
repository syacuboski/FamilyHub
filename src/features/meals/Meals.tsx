// Meals — our menu (mockup: Meals — our menu · night). A week of swipeable day
// cards (Mon–Sun) with breakfast, lunch and dinner; tap a slot to plan or edit
// it; build the grocery list for the rest of the week in one tap.
import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { add, patch, remove, useRecords } from '../../lib/sync';
import { addMealsToGrocery, addMissingForRecipe } from '../../lib/actions';
import { addDays, DOW_LONG, DOW_SHORT, MON_LONG, MON_SHORT, parseYmd, sameDay, startOfWeek, today, ymd } from '../../lib/dates';
import { planToQuery, lastHeadcount } from '../../lib/headcount';
import { EclipseGlow } from '../../theme/art/Art';
import { Confirm, Loading, Screen, Sheet, Stepper, useToast } from '../../shared/ui';
import type { MenuEntry, Recipe, Slot } from '../../lib/types';
import '../calendar/calendar.css';
import './meals.css';

const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner'];
const SLOT_LABEL: Record<Slot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

export function MealsWeek() {
  const [params, setParams] = useSearchParams();
  const menu = useRecords('menu_entries');
  const recipes = useRecords('recipes');
  const toast = useToast();
  const t0 = today();
  const sel = params.get('d') ? parseYmd(params.get('d')!) : t0;
  const weekStart = startOfWeek(sel, 1);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const idx = days.findIndex((d) => sameDay(d, sel));
  const [editing, setEditing] = useState<{ date: string; slot: Slot; entry?: MenuEntry } | null>(null);
  const [dx, setDx] = useState(0);
  const x0 = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCopy, setConfirmCopy] = useState(false);

  const byDay = useMemo(() => {
    const m = new Map<string, Partial<Record<Slot, MenuEntry>>>();
    for (const e of menu || []) {
      if (!m.has(e.date)) m.set(e.date, {});
      m.get(e.date)![e.slot] = e;
    }
    return m;
  }, [menu]);

  if (!menu || !recipes) return <Loading />;

  const go = (d: Date) => setParams(new URLSearchParams({ d: ymd(d) }), { replace: true });
  const recipeOf = (e?: MenuEntry) => recipes.find((r) => r.id === e?.recipe);
  const weekOffset = Math.round((weekStart.getTime() - startOfWeek(t0, 1).getTime()) / (7 * 864e5));
  const weekLabel = weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : weekOffset === -1 ? 'Last week' : weekOffset > 0 ? `In ${weekOffset} weeks` : `${-weekOffset} weeks ago`;
  const isPastWeek = weekOffset < 0;

  const down = (e: PointerEvent) => {
    // let taps on links and buttons through; swipe from anywhere else on the card
    if ((e.target as HTMLElement).closest('a,button')) return;
    x0.current = e.clientX;
  };
  const move = (e: PointerEvent) => x0.current !== null && setDx(e.clientX - x0.current);
  const up = () => {
    if (x0.current === null) return;
    x0.current = null;
    if (dx < -60) go(addDays(sel, 1));
    else if (dx > 60) go(addDays(sel, -1));
    setDx(0);
  };

  async function buildList() {
    setBusy(true);
    const from = ymd(t0 > weekStart ? t0 : weekStart);
    const to = ymd(addDays(weekStart, 6));
    const entries = (menu || []).filter((e) => e.recipe && e.date >= from && e.date <= to);
    const { added, meals } = await addMealsToGrocery(entries);
    setBusy(false);
    toast({ text: meals ? (added ? `Added ${added} item${added === 1 ? '' : 's'} to Grocery for ${meals} meal${meals === 1 ? '' : 's'}` : 'Everything for this week is in stock or on the list') : 'No recipes planned for the rest of this week yet' });
  }

  async function planAgain() {
    // copy this past week's plan into the current week, filling only empty slots
    const target = startOfWeek(t0, 1);
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const src = byDay.get(ymd(days[i])) || {};
      const dst = byDay.get(ymd(addDays(target, i))) || {};
      for (const s of SLOTS) {
        const e = src[s];
        if (!e || dst[s]) continue;
        const { id, household, created, updated, _pending, ...rest } = e;
        void id; void household; void created; void updated; void _pending;
        await add('menu_entries', { ...rest, date: ymd(addDays(target, i)) } as Omit<MenuEntry, 'id' | 'household'>);
        n++;
      }
    }
    setConfirmCopy(false);
    go(target);
    toast({ text: n ? `Copied ${n} meal${n === 1 ? '' : 's'} into this week` : 'This week already has those slots planned' });
  }

  const deck = [0, 1, 2].map((k) => addDays(sel, k));

  return (
    <Screen
      art={<><EclipseGlow /></>}
      header={
        <>
          <div className="header-row">
            <p className="eyebrow">Meals</p>
            <Link to="/recipes" className="btn btn-ghost btn-sm">Our Cookbook</Link>
          </div>
          <h1 className="display h1">Our menu</h1>
          <div className="week-head">
            <button type="button" className="chip round" aria-label="Previous week" onClick={() => go(addDays(weekStart, -7))}>‹</button>
            <div className="grow stack" style={{ alignItems: 'center', gap: 0 }}>
              <span style={{ fontWeight: 500 }}>{weekLabel}</span>
              <span className="tiny muted">{MON_SHORT[days[0].getMonth()]} {days[0].getDate()} – {MON_SHORT[days[6].getMonth()]} {days[6].getDate()}</span>
            </div>
            <button type="button" className="chip round" aria-label="Next week" onClick={() => go(addDays(weekStart, 7))}>›</button>
            {!sameDay(sel, t0) && <button type="button" className="btn btn-primary btn-sm" onClick={() => go(t0)}>Today</button>}
          </div>
          <div className="day-chips" role="group" aria-label="Days">
            {days.map((d, i) => {
              const on = i === idx;
              const planned = Object.keys(byDay.get(ymd(d)) || {}).length;
              return (
                <button
                  key={ymd(d)}
                  type="button"
                  className={`day-chip glass${on ? ' on' : ''}${sameDay(d, t0) && !on ? ' today' : ''}${d < t0 && !on ? ' past' : ''}`}
                  aria-pressed={on}
                  aria-label={`${DOW_LONG[d.getDay()]} ${MON_LONG[d.getMonth()]} ${d.getDate()}, ${planned} of 3 meals planned`}
                  onClick={() => go(d)}
                >
                  <span className="dow">{DOW_SHORT[d.getDay()]}</span>
                  <span className="num">{d.getDate()}</span>
                </button>
              );
            })}
          </div>
        </>
      }
    >
      <div className="deck" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
        {deck.slice().reverse().map((d) => {
          const k = Math.round((d.getTime() - sel.getTime()) / 864e5);
          const front = k === 0;
          const day = byDay.get(ymd(d)) || {};
          const past = d < t0;
          const tag = sameDay(d, t0) ? 'Today' : SLOTS.some((s) => day[s]?.is_prep) ? 'Prep day' : past ? 'Past' : '';
          return (
            <section
              key={ymd(d)}
              className={`day-card glass${front ? ' front' : ''}`}
              aria-hidden={!front}
              aria-label={`${DOW_LONG[d.getDay()]} ${MON_LONG[d.getMonth()]} ${d.getDate()}`}
              style={{
                transform: `translateX(${front ? dx : 0}px) translateY(${k * 14}px) rotate(${front ? dx / 28 : 0}deg) scale(${1 - k * 0.05})`,
                opacity: front ? 1 : k === 1 ? 0.7 : 0.45,
                zIndex: 3 - k,
                transition: x0.current !== null && front ? 'none' : undefined,
              }}
            >
              {front && (
                <>
                  <div className="spread">
                    <h2 className="display" style={{ fontSize: 26 }}>{DOW_LONG[d.getDay()]} {d.getDate()}</h2>
                    {tag && <span className="small" style={{ color: tag === 'Today' ? 'var(--link)' : tag === 'Prep day' ? 'var(--teal)' : 'var(--muted)' }}>{tag}</span>}
                  </div>
                  {SLOTS.map((s) => {
                    const e = day[s];
                    const r = recipeOf(e);
                    const name = r?.title || e?.text || '';
                    return (
                      <button key={s} type="button" className={`slot${e ? '' : ' empty'}`} onClick={() => setEditing({ date: ymd(d), slot: s, entry: e })}>
                        <span className="slot-label">{SLOT_LABEL[s]}</span>
                        {e ? (
                          <>
                            <span className={r ? 'slot-dish link' : 'slot-dish'}>{name}{r ? ' ›' : ''}</span>
                            {(e.note || e.is_prep) && <span className="slot-note">{[e.is_prep ? `Meal prep · ${(e.prep_adult || 0) + (e.prep_kid || 0)} portions` : '', e.note].filter(Boolean).join(' · ')}</span>}
                          </>
                        ) : past ? (
                          <span className="slot-dish faint">Nothing planned</span>
                        ) : (
                          <span className="slot-dish link">+ Add {SLOT_LABEL[s].toLowerCase()}</span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </section>
          );
        })}
      </div>

      <div className="spread" style={{ alignItems: 'center' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(addDays(sel, -1))}>‹ {DOW_SHORT[addDays(sel, -1).getDay()]}</button>
        <span className="tiny muted">Swipe the cards</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(addDays(sel, 1))}>{DOW_SHORT[addDays(sel, 1).getDay()]} ›</button>
      </div>

      <div className="meals-action">
      {isPastWeek ? (
        confirmCopy ? (
          <Confirm text="Copy this week's meals into the current week? Slots you've already planned are kept." confirmLabel="Copy meals" onCancel={() => setConfirmCopy(false)} onConfirm={planAgain} />
        ) : (
          <button type="button" className="btn btn-primary btn-block" onClick={() => setConfirmCopy(true)}>Plan this week again</button>
        )
      ) : (
        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={buildList}>{busy ? 'Building…' : 'Build grocery list for the week'}</button>
      )}
      </div>

      {editing && <MealSheet {...editing} recipes={recipes} onClose={() => setEditing(null)} />}
    </Screen>
  );
}

// ---------- plan / edit one meal ----------
function MealSheet({ date, slot, entry, recipes, onClose }: { date: string; slot: Slot; entry?: MenuEntry; recipes: Recipe[]; onClose: () => void }) {
  const toast = useToast();
  const sorted = useMemo(() => recipes.slice().sort((a, b) => a.title.localeCompare(b.title)), [recipes]);
  const initialChoice = entry?.recipe ? entry.recipe : entry?.text === 'Leftovers' ? '__left' : entry?.text === 'Eating out' ? '__out' : entry?.text ? '__other' : sorted[0]?.id || '__left';
  const [choice, setChoice] = useState(initialChoice);
  const [other, setOther] = useState(initialChoice === '__other' ? entry?.text || '' : '');
  const [note, setNote] = useState(entry?.note || '');
  const hc = lastHeadcount();
  const [adults, setAdults] = useState(entry?.adults ?? hc.adults);
  const [kids, setKids] = useState(entry?.kids ?? hc.kids);
  const [prep, setPrep] = useState(!!entry?.is_prep);
  const [prepA, setPrepA] = useState(entry?.prep_adult || 4);
  const [prepK, setPrepK] = useState(entry?.prep_kid ?? 0);
  const [addMissing, setAddMissing] = useState(!entry);
  const [confirm, setConfirm] = useState(false);
  const isRecipe = !choice.startsWith('__');
  const recipe = sorted.find((r) => r.id === choice);
  const d = parseYmd(date);

  async function save() {
    const text = choice === '__left' ? 'Leftovers' : choice === '__out' ? 'Eating out' : choice === '__other' ? other.trim() : '';
    if (choice === '__other' && !text) return;
    const data: Partial<MenuEntry> = {
      date, slot, recipe: isRecipe ? choice : '', text, note: note.trim(), adults, kids,
      is_prep: isRecipe && prep, prep_adult: isRecipe && prep ? prepA : 0, prep_kid: isRecipe && prep ? prepK : 0,
    };
    if (entry) await patch('menu_entries', entry.id, data);
    else await add('menu_entries', data as Omit<MenuEntry, 'id' | 'household'>);
    let n = 0;
    if (isRecipe && addMissing && recipe) {
      const k = recipe.kid_portion ?? 0.5;
      n = await addMissingForRecipe(recipe.id, adults + kids * k + (prep ? prepA + prepK * k : 0));
    }
    toast({ text: `${SLOT_LABEL[slot]} planned${n ? ` · ${n} item${n === 1 ? '' : 's'} to Grocery` : ''}` });
    onClose();
  }

  const recipeQuery = planToQuery({ adults, kids, prepA: prep ? prepA : 0, prepK: prep ? prepK : 0 });

  return (
    <Sheet
      title={`${SLOT_LABEL[slot]} · ${DOW_SHORT[d.getDay()]} ${MON_SHORT[d.getMonth()]} ${d.getDate()}`}
      onClose={onClose}
      footer={<button type="button" className="btn btn-primary btn-block" disabled={choice === '__other' && !other.trim()} onClick={save}>{entry ? 'Save' : 'Add to menu'}</button>}
    >
      <label className="field">
        What's for {SLOT_LABEL[slot].toLowerCase()}?
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          {sorted.length > 0 && <optgroup label="Our Cookbook">{sorted.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</optgroup>}
          <optgroup label="Other">
            <option value="__left">Leftovers</option>
            <option value="__out">Eating out</option>
            <option value="__other">Something else…</option>
          </optgroup>
        </select>
      </label>
      {choice === '__other' && <label className="field">Meal<input value={other} onChange={(e) => setOther(e.target.value)} placeholder="e.g. Sandwiches" autoFocus /></label>}
      <label className="field">
        {choice === '__left' ? 'Which leftovers?' : choice === '__out' ? 'Where?' : 'Note (optional)'}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={choice === '__left' ? 'e.g. Turkey chili from Monday' : choice === '__out' ? 'e.g. restaurant, 6:30 PM' : ''} />
      </label>
      {isRecipe && (
        <>
          <div className="glass card" style={{ padding: 14, gap: 8 }}>
            <div className="spread" style={{ alignItems: 'center' }}><span>Adults</span><Stepper label="adults" value={adults} onChange={setAdults} /></div>
            <div className="spread" style={{ alignItems: 'center' }}><span>Kids</span><Stepper label="kids" value={kids} onChange={setKids} /></div>
            <label className="row" style={{ borderBottom: 'none', minHeight: 36 }}><input type="checkbox" checked={prep} onChange={() => setPrep(!prep)} />Make extra for meal prep</label>
            {prep && (
              <>
                <div className="spread" style={{ alignItems: 'center' }}><span>Adult prep portions</span><Stepper label="adult prep portions" value={prepA} onChange={setPrepA} /></div>
                <div className="spread" style={{ alignItems: 'center' }}><span>Kid prep portions</span><Stepper label="kid prep portions" value={prepK} onChange={setPrepK} /></div>
              </>
            )}
            <label className="row" style={{ borderBottom: 'none', minHeight: 36 }}><input type="checkbox" checked={addMissing} onChange={() => setAddMissing(!addMissing)} />Add missing ingredients to Grocery</label>
          </div>
          {recipe && <Link to={`/recipes/${recipe.id}?${recipeQuery}`} className="small">Open the recipe for these numbers ›</Link>}
        </>
      )}
      {entry && !confirm && <button type="button" className="btn btn-danger btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(true)}>Remove from menu</button>}
      {entry && confirm && (
        <Confirm text={`Remove ${SLOT_LABEL[slot].toLowerCase()} from ${DOW_LONG[d.getDay()]}?`} confirmLabel="Remove" onCancel={() => setConfirm(false)} onConfirm={async () => { await remove('menu_entries', entry.id); onClose(); }} />
      )}
    </Sheet>
  );
}
