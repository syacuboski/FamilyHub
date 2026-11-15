// Recipe page (mockup: Recipe — portion & prep scaler · night).
// Adults + kids eating tonight, plus extra meal prep portions; every ingredient
// scales, with Need / In stock against Inventory.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useRecord, useRecords } from '../../lib/sync';
import { fileUrl } from '../../lib/pb';
import { caloriesFrom, fmtMinutes, fmtQty } from '../../lib/scale';
import { needsFor, additionsFor } from '../../lib/missing';
import { addAdditions, defaultList, shortTitle } from '../../lib/actions';
import { planFromParams, planToQuery, planTotals, rememberHeadcount, type Plan } from '../../lib/headcount';
import { BackLink, Loading, Screen, Stepper, useToast } from '../../shared/ui';
import { ingredientQty } from './ingredientText';
import './recipes.css';

export function RecipeView() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const r = useRecord('recipes', id);
  const allIngs = useRecords('recipe_ingredients');
  const inventory = useRecords('inventory');
  const listRows = useRecords('list_items');
  const lists = useRecords('lists');
  const groceryId = useMemo(() => (lists || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[0]?.id, [lists]);
  const toast = useToast();
  const [plan, setPlanState] = useState<Plan>(() => planFromParams(params));
  const [prepAText, setPrepAText] = useState(String(plan.prepA || ''));
  const [prepKText, setPrepKText] = useState(String(plan.prepK || ''));

  const ings = useMemo(() => (allIngs || []).filter((i) => i.recipe === id).sort((a, b) => (a.sort || 0) - (b.sort || 0)), [allIngs, id]);

  // keep the plan in the URL so Back, cook mode and labels all agree
  useEffect(() => {
    setParams(new URLSearchParams(planToQuery(plan)), { replace: true });
    rememberHeadcount(plan);
  }, [plan, setParams]);

  const kid = r?.kid_portion ?? 0.5;
  const totals = planTotals(plan, kid);
  const factor = r?.servings ? totals.total / r.servings : 1;
  const needs = useMemo(() => needsFor(ings, factor, inventory || []), [ings, factor, inventory]);
  const adds = useMemo(() => additionsFor(needs, (listRows || []).filter((x) => x.list === groceryId)), [needs, listRows, groceryId]);
  const onList = useMemo(() => {
    const k = (s: string) => s.trim().toLowerCase().replace(/s$/, '');
    const rows = (listRows || []).filter((x) => x.list === groceryId && !x.checked);
    return needs.map((n) => !n.inStock && rows.some((x) => (n.item && x.item === n.item) || k(x.name) === k(n.name)));
  }, [needs, listRows, groceryId]);

  if (r === undefined) return <Loading />;
  if (r === null) return <Screen fab={false} header={<BackLink to="/recipes" label="Cookbook" />}><p className="empty">That recipe was deleted.</p></Screen>;

  const setPlan = (p: Partial<Plan>) => setPlanState((x) => ({ ...x, ...p }));
  const num = (t: string) => {
    const v = parseInt(t, 10);
    return isNaN(v) ? 0 : Math.min(999, Math.max(0, v));
  };
  const mins = (r.prep_min || 0) + (r.cook_min || 0);
  const kcal = caloriesFrom(r.protein || 0, r.carbs || 0, r.fat || 0);
  const q = planToQuery(plan);
  const nothingToCook = totals.total <= 0;

  async function addMissing() {
    const list = await defaultList();
    if (!list) return;
    // only items not already on that list
    const rows = (listRows || []).filter((x) => x.list === list.id);
    const n = await addAdditions(list.id, additionsFor(needs, rows), shortTitle(r!.title));
    toast({ text: n ? `Added ${n} item${n === 1 ? '' : 's'} to ${list.name}` : `Everything is already on ${list.name}` });
  }

  return (
    <Screen
      fab={false}
      header={
        <div className="header-row">
          <BackLink fallback="/recipes" label="Back" />
          <div className="chips" style={{ flexWrap: 'nowrap' }}>
            <Link to={`/recipes/${r.id}/edit`} className="btn btn-ghost btn-sm">Edit</Link>
            <Link to={`/recipes/${r.id}/cook?${q}`} className={`btn btn-primary btn-sm${nothingToCook ? ' disabled' : ''}`} aria-disabled={nothingToCook}>Cook mode</Link>
          </div>
        </div>
      }
    >
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="display" style={{ fontSize: 30 }}>{r.title}</h1>
        <p className="small muted" style={{ margin: 0 }}>
          {[fmtMinutes(mins), `recipe makes ${r.servings || '?'} portions`].filter(Boolean).join(' · ')}
        </p>
        {(r.tags || []).length > 0 && <div className="chips">{(r.tags || []).map((t) => <span key={t} className="pill">{t}</span>)}</div>}
      </div>

      {r.photo && <img className="recipe-hero" src={fileUrl(r as never, r.photo, '400x300')} alt={r.title} />}

      <section className="glass card" aria-label="Who's eating" style={{ gap: 8 }}>
        <h2 className="label">Eating tonight</h2>
        <div className="spread" style={{ alignItems: 'center' }}>
          <span>Adults</span>
          <Stepper label="adults" value={plan.adults} onChange={(v) => setPlan({ adults: v })} />
        </div>
        <div className="spread" style={{ alignItems: 'center' }}>
          <span>Kids <span className="small muted">· kid portion = {kid >= 1 ? 'adult' : `${fmtQty(kid)} adult`}</span></span>
          <Stepper label="kids" value={plan.kids} onChange={(v) => setPlan({ kids: v })} />
        </div>
      </section>

      <section className="glass card" aria-label="Meal prep" style={{ gap: 8 }}>
        <h2 className="label">Meal prep · extra portions</h2>
        <div className="field-row">
          <label className="field">Adult portions
            <input type="number" inputMode="numeric" min={0} max={999} value={prepAText} placeholder="0" onChange={(e) => { setPrepAText(e.target.value); setPlan({ prepA: num(e.target.value) }); }} />
          </label>
          <label className="field">Kid portions
            <input type="number" inputMode="numeric" min={0} max={999} value={prepKText} placeholder="0" onChange={(e) => { setPrepKText(e.target.value); setPlan({ prepK: num(e.target.value) }); }} />
          </label>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>Set tonight to 0 to prep only. Type any amount, like 20 or 40.</p>
      </section>

      <div className="scale-summary">
        <p style={{ margin: 0 }}>Tonight {fmtQty(totals.tonight) || '0'} · Prep {fmtQty(totals.prep) || '0'}</p>
        <p className="small" style={{ margin: 0, color: 'var(--link)' }}>
          {nothingToCook ? 'Add someone eating or some prep portions.' : `Ingredients scaled for ${fmtQty(totals.total)} portions (×${+factor.toFixed(2)} the recipe)`}
        </p>
      </div>

      {kcal > 0 && (
        <section className="glass card" aria-label="Nutrition per adult portion">
          <div className="macro-grid">
            <div><div className="v">{kcal}</div><div className="tiny muted">Calories</div></div>
            <div><div className="v">{r.protein || 0}g</div><div className="tiny muted">Protein</div></div>
            <div><div className="v">{r.carbs || 0}g</div><div className="tiny muted">Carbs</div></div>
            <div><div className="v">{r.fat || 0}g</div><div className="tiny muted">Fat</div></div>
          </div>
          <p className="tiny muted" style={{ margin: 0, textAlign: 'center' }}>per adult portion{r.portion_weight ? ` (${r.portion_weight} ${r.weight_unit || 'g'})` : ''}{kid < 1 ? ` · a kid portion is ${fmtQty(kid)} of that` : ''}</p>
        </section>
      )}

      <section className="glass card" aria-label="Ingredients" style={{ gap: 4 }}>
        <h2 className="label">Ingredients</h2>
        {ings.map((i, n) => (
          <div key={i.id} className="ing-line">
            <span className="q">{ingredientQty(i, factor)}</span>
            <span className="grow">{i.name}{i.prep && <span className="muted">, {i.prep}</span>}</span>
            {needs[n]?.inStock ? <span className="pill pill-teal">In stock</span> : onList[n] ? <span className="pill" style={{ opacity: 0.75 }}>On list</span> : <span className="pill">Need</span>}
          </div>
        ))}
        {ings.length === 0 && <p className="empty">No ingredients yet.</p>}
      </section>

      <div className="stack" style={{ gap: 10 }}>
        <button type="button" className="btn btn-primary btn-block" disabled={!adds.length || nothingToCook} onClick={addMissing}>
          {adds.length ? `Add ${adds.length} missing item${adds.length === 1 ? '' : 's'} to Grocery` : 'Everything is in stock or on the list'}
        </button>
        <Link to={`/recipes/${r.id}/labels?${q}`} className="btn btn-ghost btn-block">
          {totals.containers > 0 ? `Print ${totals.containers} meal prep label${totals.containers === 1 ? '' : 's'}` : 'Meal prep labels'}
        </Link>
      </div>

      <section className="glass card" aria-label="Steps" style={{ gap: 12 }}>
        <h2 className="label">Steps</h2>
        {(r.steps || []).map((s, i) => (
          <div key={i} className="step-line">
            <span className="step-num" style={{ marginTop: 0 }}>{i + 1}</span>
            <span className="grow">{s.text}{s.timer_min ? <span className="tiny" style={{ color: 'var(--teal)' }}> · {s.timer_min} min timer</span> : null}</span>
          </div>
        ))}
        {(r.steps || []).length === 0 && <p className="empty">No steps yet.</p>}
      </section>

      {(r.reheat || r.notes || r.source_url) && (
        <section className="glass card" style={{ gap: 8 }}>
          {r.reheat && <p style={{ margin: 0 }}><span className="label">Reheat </span> {r.reheat}</p>}
          {r.notes && <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{r.notes}</p>}
          {r.source_url && <a href={r.source_url} target="_blank" rel="noreferrer" className="small">Original recipe ›</a>}
        </section>
      )}
    </Screen>
  );
}
