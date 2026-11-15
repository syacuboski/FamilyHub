// Today (mockup: Today · night): greeting, today's meals with tonight's dinner,
// today's calendar, tasks due, running low and expiring food.
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useRecords } from '../../lib/sync';
import { addMissingForRecipe, addToList, completeTask, defaultList } from '../../lib/actions';
import { needsFor } from '../../lib/missing';
import { daysBetween, fmtHeaderDate, greeting, parseYmd, today, ymd } from '../../lib/dates';
import { portionsFor, caloriesFrom } from '../../lib/scale';
import { MoonHero } from '../../theme/art/Art';
import { IconGear } from '../../shared/Icons';
import { Screen, useMembers, useToast } from '../../shared/ui';
import { useAgenda } from '../calendar/useAgenda';
import type { MenuEntry, Slot } from '../../lib/types';
import '../calendar/calendar.css';
import './today.css';


export function Today() {
  const t0 = today();
  const key = ymd(t0);
  const members = useMembers();
  const toast = useToast();
  const tasks = useRecords('tasks');
  const menu = useRecords('menu_entries');
  const recipes = useRecords('recipes');
  const ings = useRecords('recipe_ingredients');
  const inventory = useRecords('inventory');
  const listRows = useRecords('list_items');
  const { byDay } = useAgenda(t0, 1);
  const agenda = (byDay.get(key) || []).filter((i) => i.kind === 'event');

  const meals = useMemo(() => {
    const m: Partial<Record<Slot, MenuEntry>> = {};
    for (const e of menu || []) if (e.date === key) m[e.slot] = e;
    return m;
  }, [menu, key]);
  const dinner = meals.dinner;
  const dinnerRecipe = recipes?.find((r) => r.id === dinner?.recipe);
  const missing = useMemo(() => {
    if (!dinnerRecipe || !ings || !inventory) return [];
    const p = portionsFor({ adults: dinner?.adults ?? 2, kids: dinner?.kids ?? 1 }, dinnerRecipe.kid_portion ?? 0.5);
    const factor = dinnerRecipe.servings ? p.total / dinnerRecipe.servings : 1;
    return needsFor(ings.filter((i) => i.recipe === dinnerRecipe.id), factor, inventory).filter((n) => !n.inStock);
  }, [dinnerRecipe, ings, inventory, dinner]);
  const alreadyListed = (name: string) => (listRows || []).some((r) => !r.checked && r.name.toLowerCase() === name.toLowerCase());
  const missingNotListed = missing.filter((n) => !alreadyListed(n.name));

  const due = (tasks || []).filter((t) => !t.done && t.due && t.due <= key).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
  const low = (inventory || []).filter((i) => i.qty <= i.low && (i.low > 0 || i.qty === 0)).slice(0, 6);
  const expiring = (inventory || []).filter((i) => i.expires_on && daysBetween(t0, parseYmd(i.expires_on)) <= 3 && i.qty > 0).sort((a, b) => a.expires_on!.localeCompare(b.expires_on!));

  const summary = [
    `${agenda.length} event${agenda.length === 1 ? '' : 's'}`,
    `${due.length} task${due.length === 1 ? '' : 's'}`,
    low.length ? `${low.length} item${low.length === 1 ? '' : 's'} running low` : null,
  ].filter(Boolean).join(' · ');

  const recipeTitle = (e?: MenuEntry) => (e?.recipe ? recipes?.find((r) => r.id === e.recipe)?.title : e?.text) || '';
  const name = members.me?.name;

  async function addLow(name: string) {
    const list = await defaultList();
    if (!list) return;
    await addToList(list.id, { name, qty: 1, source: 'Running low' });
    toast({ text: `Added ${name} to ${list.name}` });
  }

  async function addMissing() {
    if (!dinnerRecipe) return;
    const p = portionsFor({ adults: dinner?.adults ?? 2, kids: dinner?.kids ?? 1 }, dinnerRecipe.kid_portion ?? 0.5);
    const n = await addMissingForRecipe(dinnerRecipe.id, p.total);
    toast({ text: n ? `Added ${n} item${n === 1 ? '' : 's'} to Grocery` : 'Everything is already on the list' });
  }

  const kcal = dinnerRecipe ? caloriesFrom(dinnerRecipe.protein || 0, dinnerRecipe.carbs || 0, dinnerRecipe.fat || 0) : 0;
  const time = dinnerRecipe ? (dinnerRecipe.prep_min || 0) + (dinnerRecipe.cook_min || 0) : 0;

  return (
    <Screen
      art={<MoonHero />}
      header={
        <div className="today-head">
          <div className="header-row">
            <p className="eyebrow">{fmtHeaderDate(t0)}</p>
            <Link to="/settings" className="icon-link" aria-label="Settings"><IconGear /></Link>
          </div>
          <h1 className="display" style={{ fontSize: 38 }}>{greeting()}{name ? `, ${name}` : ''}</h1>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>{summary}</p>
        </div>
      }
    >
      <section className="glass card">
        <div className="spread">
          <p className="label">Today's meals</p>
          <Link to="/meals" className="small">This week ›</Link>
        </div>
        {(['breakfast', 'lunch'] as Slot[]).map((s) => (
          <div key={s} className="meal-line">
            <span className="slot">{s}</span>
            <span className="grow">{recipeTitle(meals[s]) || <span className="faint">Nothing planned</span>}</span>
            {meals[s]?.note && <span className="tiny" style={{ color: 'var(--teal)' }}>{meals[s]!.note}</span>}
          </div>
        ))}
        <p className="tiny" style={{ margin: '4px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-hi)' }}>Dinner</p>
        {dinner ? (
          <>
            <h2 className="display" style={{ fontSize: 23, lineHeight: 1.15 }}>
              {dinnerRecipe ? <Link to={`/recipes/${dinnerRecipe.id}`}>{dinnerRecipe.title} ›</Link> : recipeTitle(dinner)}
            </h2>
            {dinner.note && !dinnerRecipe && <p className="small muted" style={{ margin: 0 }}>{dinner.note}</p>}
            {dinnerRecipe && (
              <div className="chips">
                <span className="tag">{dinner.adults ?? 2} adult{(dinner.adults ?? 2) === 1 ? '' : 's'} + {dinner.kids ?? 1} kid{(dinner.kids ?? 1) === 1 ? '' : 's'}</span>
                {time > 0 && <span className="tag">{time} min</span>}
                {kcal > 0 && <span className="tag">{kcal} cal / serving</span>}
              </div>
            )}
            {missingNotListed.length > 0 && (
              <button type="button" className="btn btn-primary" onClick={addMissing}>Add {missingNotListed.length} missing item{missingNotListed.length === 1 ? '' : 's'} to Grocery</button>
            )}
          </>
        ) : (
          <Link to="/add?type=meal" state={{ bg: { pathname: '/' } }} className="small">+ Plan tonight's dinner</Link>
        )}
      </section>

      <section className="glass card" style={{ gap: 12 }}>
        <div className="spread">
          <p className="label">Today</p>
          <Link to="/calendar" className="small">Calendar ›</Link>
        </div>
        {agenda.map((it) => (
          <Link key={it.key} to={it.to} className="agenda-line">
            <span className="t">{it.time}</span>
            <span className="chip-dot" style={{ background: it.color }} />
            <span className="grow">{it.title}</span>
            <span className="small muted">{members.name(it.owner, 'All')}</span>
          </Link>
        ))}
        {agenda.length === 0 && <p className="empty" style={{ margin: 0 }}>Nothing on the calendar today.</p>}
      </section>

      <section className="glass card">
        <div className="spread">
          <p className="label">Tasks due</p>
          <Link to="/home/tasks" className="small">All tasks ›</Link>
        </div>
        {due.map((t) => (
          <label key={t.id} className="row" style={{ minHeight: 40, borderBottom: 'none' }}>
            <input type="checkbox" checked={false} onChange={async () => {
              const r = await completeTask(t);
              toast({ text: `Done: ${t.title}`, action: { label: 'Undo', run: () => void r.undo() } });
            }} />
            <span className="grow">{t.title}{t.due < key && <span className="tiny" style={{ color: 'var(--warn)' }}> · overdue</span>}</span>
            <span className="tiny muted">{members.name(t.assignee, 'All')}</span>
          </label>
        ))}
        {due.length === 0 && <p className="empty" style={{ margin: 0 }}>Nothing due. Nice.</p>}
      </section>

      {(low.length > 0 || expiring.length > 0) && (
        <section className="glass card">
          <div className="spread">
            <p className="label">Running low</p>
            <Link to="/home/inventory" className="small">Inventory ›</Link>
          </div>
          {low.map((i) => (
            <div key={i.id} className="row" style={{ borderBottom: 'none', minHeight: 40 }}>
              <span className="grow">{i.name} <span className="muted">· {i.qty === 0 ? 'out' : `${i.qty} ${i.unit || 'left'}`}</span></span>
              {alreadyListed(i.name)
                ? <span className="tiny muted">On the list</span>
                : <button type="button" className="btn btn-ghost btn-sm" onClick={() => addLow(i.name)}>Add to list</button>}
            </div>
          ))}
          {expiring.map((i) => (
            <div key={i.id} className="row" style={{ borderBottom: 'none', minHeight: 36 }}>
              <span className="grow">{i.name}</span>
              <span className="tiny" style={{ color: 'var(--warn)' }}>
                {(() => { const d = daysBetween(t0, parseYmd(i.expires_on!)); return d < 0 ? 'expired' : d === 0 ? 'use today' : `use in ${d} day${d === 1 ? '' : 's'}`; })()}
              </span>
            </div>
          ))}
        </section>
      )}
    </Screen>
  );
}
