// Recipe page. For Checkpoint B this shows the recipe as written; the
// adult/kid portion scaler, cook mode and prep labels come next in Phase 3.
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useRecord, useRecords } from '../../lib/sync';
import { fileUrl } from '../../lib/pb';
import { caloriesFrom, fmtMinutes, fmtQty } from '../../lib/scale';
import { BackLink, Loading, Screen } from '../../shared/ui';
import './recipes.css';

export function RecipeView() {
  const { id } = useParams();
  const r = useRecord('recipes', id);
  const allIngs = useRecords('recipe_ingredients');
  const ings = useMemo(() => (allIngs || []).filter((i) => i.recipe === id).sort((a, b) => (a.sort || 0) - (b.sort || 0)), [allIngs, id]);

  if (r === undefined) return <Loading />;
  if (r === null) return <Screen fab={false} header={<BackLink to="/recipes" label="Cookbook" />}><p className="empty">That recipe was deleted.</p></Screen>;

  const mins = (r.prep_min || 0) + (r.cook_min || 0);
  const kcal = caloriesFrom(r.protein || 0, r.carbs || 0, r.fat || 0);
  const kid = r.kid_portion ?? 0.5;

  return (
    <Screen
      fab={false}
      header={
        <div className="header-row">
          <BackLink to="/recipes" label="Cookbook" />
          <Link to={`/recipes/${r.id}/edit`} className="btn btn-ghost btn-sm">Edit</Link>
        </div>
      }
    >
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="display" style={{ fontSize: 30 }}>{r.title}</h1>
        <p className="small muted" style={{ margin: 0 }}>
          {[fmtMinutes(mins), r.prep_min ? `prep ${r.prep_min}` : '', r.cook_min ? `cook ${r.cook_min}` : '', `makes ${r.servings || '?'} portions`, kid < 1 ? `kid portion = ${fmtQty(kid)} adult` : 'kids eat a full portion']
            .filter(Boolean)
            .join(' · ')}
        </p>
        {(r.tags || []).length > 0 && <div className="chips">{(r.tags || []).map((t) => <span key={t} className="pill">{t}</span>)}</div>}
      </div>

      {r.photo && <img className="recipe-hero" src={fileUrl(r as never, r.photo, '400x300')} alt={r.title} />}

      {kcal > 0 && (
        <section className="glass card" aria-label="Nutrition per portion">
          <div className="macro-grid">
            <div><div className="v">{kcal}</div><div className="tiny muted">Calories</div></div>
            <div><div className="v">{r.protein || 0}g</div><div className="tiny muted">Protein</div></div>
            <div><div className="v">{r.carbs || 0}g</div><div className="tiny muted">Carbs</div></div>
            <div><div className="v">{r.fat || 0}g</div><div className="tiny muted">Fat</div></div>
          </div>
          {r.portion_weight ? <p className="tiny muted" style={{ margin: 0, textAlign: 'center' }}>per {r.portion_weight} {r.weight_unit || 'g'} portion</p> : null}
        </section>
      )}

      <section className="glass card" aria-label="Ingredients" style={{ gap: 4 }}>
        <h2 className="label">Ingredients · as written</h2>
        {ings.map((i) => (
          <div key={i.id} className="ing-line">
            <span className="q">{i.unit === 'to taste' ? 'to taste' : `${i.qty ? fmtQty(i.qty) : ''}${i.unit && i.unit !== 'whole' ? ` ${i.unit}` : ''}`}</span>
            <span className="grow">{i.name}{i.prep && <span className="muted">, {i.prep}</span>}</span>
          </div>
        ))}
        {ings.length === 0 && <p className="empty">No ingredients yet.</p>}
      </section>

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

      <p className="tiny faint" style={{ textAlign: 'center' }}>Portion scaler, cook mode and meal prep labels arrive after Checkpoint B.</p>
    </Screen>
  );
}
