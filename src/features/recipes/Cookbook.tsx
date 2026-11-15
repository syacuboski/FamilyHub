// Our Cookbook (mockup: Our Cookbook · night): search recipes or ingredients,
// filter by category, edit which categories show and in what order.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { add, patch, useRecords } from '../../lib/sync';
import { fileUrl } from '../../lib/pb';
import { fmtMinutes } from '../../lib/scale';
import { BackLink, Loading, Screen } from '../../shared/ui';
import type { Recipe, Tag } from '../../lib/types';
import './recipes.css';

export function Cookbook() {
  const recipes = useRecords('recipes');
  const ings = useRecords('recipe_ingredients');
  const tags = useRecords('tags');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('All');
  const [managing, setManaging] = useState(false);
  const [newCat, setNewCat] = useState('');

  const cats = useMemo(() => (tags || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), [tags]);
  const ingText = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of ings || []) m[i.recipe] = `${m[i.recipe] || ''} ${i.name}`;
    return m;
  }, [ings]);
  const hay = (r: Recipe) => `${r.title} ${ingText[r.id] || ''}`.toLowerCase();
  const hasTag = (r: Recipe, t: string) => (r.tags || []).some((x) => x.toLowerCase() === t.toLowerCase());
  const countOf = (t: string) => (recipes || []).filter((r) => hasTag(r, t)).length;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (recipes || [])
      .filter((r) => (tag === 'All' || hasTag(r, tag)) && (!q || hay(r).includes(q)))
      .sort((a, b) => a.title.localeCompare(b.title));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipes, tag, query, ingText]);

  if (!recipes || !tags) return <Loading />;

  async function move(i: number, to: number) {
    if (to < 0 || to >= cats.length) return;
    const next = cats.slice();
    const [it] = next.splice(i, 1);
    next.splice(to, 0, it);
    for (const [idx, c] of next.entries()) if (c.sort !== idx) await patch('tags', c.id, { sort: idx });
  }

  async function addCat() {
    const n = newCat.trim();
    if (!n || cats.some((c) => c.name.toLowerCase() === n.toLowerCase())) return;
    await add('tags', { name: n, group: 'yours', show: true, sort: cats.length } as Omit<Tag, 'id' | 'household'>);
    setNewCat('');
  }

  const shown = cats.filter((c) => c.show);
  const time = (r: Recipe) => fmtMinutes((r.prep_min || 0) + (r.cook_min || 0));

  return (
    <Screen
      fab={false}
      header={
        <>
          <div className="header-row">
            <BackLink to="/meals" label="Meals" />
            <Link to="/recipes/new" className="btn btn-primary btn-sm">+ New recipe</Link>
          </div>
          <h1 className="display h1">Our Cookbook</h1>
          <p className="small muted" style={{ margin: 0 }}>{recipes.length} family recipe{recipes.length === 1 ? '' : 's'}</p>
          <label htmlFor="cb-search" className="sr-only">Search recipes</label>
          <input id="cb-search" type="search" className="input glass" placeholder="Search recipes or ingredients…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="chips scroll" role="group" aria-label="Filter by tag" style={{ margin: '0 -20px', padding: '0 20px' }}>
            {['All', ...shown.map((c) => c.name)].map((t) => (
              <button key={t} type="button" className="chip" aria-pressed={t === tag} onClick={() => setTag(t)}>{t}</button>
            ))}
            <button type="button" className="chip chip-dashed-text" aria-pressed={managing} onClick={() => setManaging(!managing)}>{managing ? 'Done' : 'Edit'}</button>
          </div>
        </>
      }
    >
      {managing ? (
        <section className="glass card" aria-label="Categories">
          <h2 className="label">Categories</h2>
          <p className="small muted" style={{ margin: 0 }}>Choose which show as filters and in what order. Hidden ones stay on your recipes.</p>
          {cats.map((c, i) => (
            <div key={c.id} className="cat-row">
              <div className="moves">
                <button type="button" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>▲</button>
                <button type="button" aria-label={`Move ${c.name} down`} disabled={i === cats.length - 1} onClick={() => move(i, i + 1)}>▼</button>
              </div>
              <span className="grow" style={{ color: c.show ? 'var(--text)' : 'var(--faint)' }}>{c.name} <span className="small muted">· {countOf(c.name)} recipe{countOf(c.name) === 1 ? '' : 's'}</span></span>
              <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Show <input type="checkbox" checked={c.show} onChange={() => patch('tags', c.id, { show: !c.show })} />
              </label>
            </div>
          ))}
          <div className="add-bar" style={{ marginTop: 8 }}>
            <label htmlFor="new-cat" className="sr-only">New category</label>
            <input id="new-cat" className="input" placeholder="New category, e.g. Pork" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <button type="button" className="btn btn-primary btn-sm" disabled={!newCat.trim()} onClick={addCat}>Add</button>
          </div>
        </section>
      ) : (
        <>
          {list.map((r) => (
            <Link key={r.id} to={`/recipes/${r.id}`} className="recipe-card glass">
              {r.photo ? <img className="thumb" src={fileUrl(r as never, r.photo, '120x120')} alt="" loading="lazy" /> : <span className="thumb empty" aria-hidden="true">{r.title.charAt(0)}</span>}
              <span className="stack grow" style={{ gap: 2 }}>
                <span className="name">{r.title}</span>
                <span className="small muted">{[time(r), r.servings ? `${r.servings} portions` : ''].filter(Boolean).join(' · ')}</span>
                {(r.tags || []).length > 0 && <span className="tiny" style={{ color: 'var(--link)' }}>{(r.tags || []).join(' · ')}</span>}
              </span>
            </Link>
          ))}
          {list.length === 0 && (
            <p className="empty">
              {recipes.length === 0 ? <>No recipes yet. <Link to="/recipes/new">Add your first one</Link>.</> : 'No recipes match. Try another word or category.'}
            </p>
          )}
        </>
      )}
    </Screen>
  );
}
