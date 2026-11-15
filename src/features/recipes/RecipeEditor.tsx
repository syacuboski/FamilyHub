// Recipe entry (mockup: Recipe entry · night). Checkpoint B.
// Name, photo, portions and times, tags, ingredients (paste a whole list),
// steps with optional timers, calories and macros per portion.
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { add, useRecord, useRecords } from '../../lib/sync';
import { fileUrl } from '../../lib/pb';
import { UNIT_GROUPS } from '../../lib/units';
import { caloriesFrom } from '../../lib/scale';
import { deleteRecipe, draftFrom, emptyDraft, rowsFromPaste, saveRecipe, setRecipePhoto, validate, type RecipeDraft } from '../../lib/recipes';
import { IconCamera, IconTrash } from '../../shared/Icons';
import { Confirm, Loading, Screen, useGoBack, useToast } from '../../shared/ui';
import type { Tag } from '../../lib/types';
import './recipes.css';

const GROUP_NAMES: Record<string, string> = { meal: 'Meal', type: 'Type', goodfor: 'Good for', yours: 'Yours' };
const KID_PORTIONS = [
  { value: 0.25, label: '¼' },
  { value: 0.5, label: '½' },
  { value: 0.75, label: '¾' },
  { value: 1, label: 'Same' },
];

export function RecipeEditor() {
  const { id } = useParams();
  const existing = useRecord('recipes', id);
  const allIngs = useRecords('recipe_ingredients');
  const tags = useRecords('tags');
  const toast = useToast();
  const nav = useNavigate();
  const goBack = useGoBack(id ? `/recipes/${id}` : '/recipes');
  const [d, setD] = useState<RecipeDraft>(emptyDraft);
  const [loaded, setLoaded] = useState(!id);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(!id);
  const [newTag, setNewTag] = useState('');
  const [photo, setPhoto] = useState<File | null | undefined>(undefined); // undefined = unchanged, null = remove
  const [preview, setPreview] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id || loaded || !existing || !allIngs) return;
    setD(draftFrom(existing, allIngs.filter((i) => i.recipe === id)));
    setLoaded(true);
  }, [id, existing, allIngs, loaded]);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const groups = useMemo(() => {
    const by: Record<string, Tag[]> = {};
    for (const t of (tags || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))) (by[t.group || 'yours'] ||= []).push(t);
    return ['meal', 'type', 'goodfor', 'yours'].filter((g) => by[g]?.length).map((g) => ({ name: GROUP_NAMES[g], tags: by[g] }));
  }, [tags]);

  if (id && existing === null) return <Screen fab={false} header={<p className="eyebrow">Recipe</p>}><p className="empty">That recipe was deleted.</p></Screen>;
  if (id && !loaded) return <Loading />;

  const set = <K extends keyof RecipeDraft>(k: K, v: RecipeDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const toggleTag = (t: string) => set('tags', d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t]);

  // ----- ingredients -----
  const setIng = (i: number, patch: Partial<RecipeDraft['ingredients'][number]>) =>
    set('ingredients', d.ingredients.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addIng = () => set('ingredients', [...d.ingredients, { id: '', amount: '', unit: 'whole', name: '' }]);
  const removeIng = (i: number) => set('ingredients', d.ingredients.length > 1 ? d.ingredients.filter((_, j) => j !== i) : [{ id: '', amount: '', unit: 'whole', name: '' }]);
  function pasteIngredients(i: number, e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\n')) return; // a single line pastes normally
    e.preventDefault();
    const rows = rowsFromPaste(text);
    const next = d.ingredients.slice();
    const replaceEmpty = !next[i].name.trim() && !next[i].amount.trim();
    // replace the empty row they pasted into, or add after the row they were in
    next.splice(replaceEmpty ? i : i + 1, replaceEmpty ? 1 : 0, ...rows);
    set('ingredients', next);
    toast({ text: `Added ${rows.length} ingredient${rows.length === 1 ? '' : 's'}` });
  }

  // ----- steps -----
  const setStep = (i: number, patch: Partial<RecipeDraft['steps'][number]>) => set('steps', d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  function pasteSteps(i: number, e: ClipboardEvent<HTMLTextAreaElement>) {
    const text = e.clipboardData.getData('text');
    const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*(\d+[.)]|step\s*\d+:?|[-•*])\s*/i, '').trim()).filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    const next = d.steps.slice();
    const replaceEmpty = !next[i].text.trim();
    next.splice(replaceEmpty ? i : i + 1, replaceEmpty ? 1 : 0, ...lines.map((t) => ({ text: t, timer: '' })));
    set('steps', next);
  }

  async function addTag() {
    const t = newTag.trim();
    if (!t) return;
    if (!(tags || []).some((x) => x.name.toLowerCase() === t.toLowerCase())) {
      await add('tags', { name: t, group: 'yours', show: true, sort: (tags?.length || 0) + 1 } as Omit<Tag, 'id' | 'household'>);
    }
    if (!d.tags.includes(t)) set('tags', [...d.tags, t]);
    setNewTag('');
  }

  async function save() {
    const problem = validate(d);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setSaving(true);
    try {
      const rid = await saveRecipe(d, id);
      if (photo !== undefined) {
        try {
          await setRecipePhoto(rid, photo);
        } catch (e) {
          toast({ text: (e as Error).message === 'offline' ? 'Recipe saved. The photo needs a connection; add it again when you are online.' : `Recipe saved, but the photo didn't upload: ${(e as Error).message}` });
          goBack();
          return;
        }
      }
      toast({ text: id ? 'Recipe saved' : `Added ${d.title.trim()} to Our Cookbook` });
      goBack();
    } finally {
      setSaving(false);
    }
  }

  const kcal = caloriesFrom(+d.protein || 0, +d.carbs || 0, +d.fat || 0);
  const currentPhoto = photo === null ? '' : preview || (existing?.photo ? fileUrl(existing as never, existing.photo, '400x300') : '');

  return (
    <Screen
      fab={false}
      header={
        <div className="header-row recipe-edit-head">
          <button type="button" className="link-btn" onClick={goBack}>Cancel</button>
          <span className="small muted">{id ? 'Edit recipe' : 'New recipe'}</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      }
    >
      <button type="button" className="glass scan-card" disabled aria-describedby="scan-soon">
        <IconCamera />
        <span className="grow stack" style={{ gap: 0, textAlign: 'left' }}>
          <span>Scan a recipe card</span>
          <span className="tiny muted" id="scan-soon">Photo fills in this form · later phase</span>
        </span>
        <span className="pill">Soon</span>
      </button>

      <section className="glass card" style={{ gap: 14 }}>
        <label className="field">
          Recipe name
          <input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Grandma's beef stew" autoFocus={!id} />
        </label>

        <div className="photo-pick">
          {currentPhoto ? <img src={currentPhoto} alt="" className="photo-thumb" /> : <div className="photo-thumb empty" aria-hidden="true"><IconCamera size={26} /></div>}
          <div className="stack" style={{ gap: 6 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileInput.current?.click()}>{currentPhoto ? 'Change photo' : 'Add a photo'}</button>
            {currentPhoto && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setPhoto(null); setPreview(''); }}>Remove photo</button>}
            <input ref={fileInput} type="file" accept="image/*" className="sr-only" aria-label="Recipe photo" onChange={(e) => e.target.files?.[0] && setPhoto(e.target.files[0])} />
          </div>
        </div>

        <div className="field-row three">
          <label className="field">Portions<input type="number" inputMode="numeric" min={1} value={d.servings} onChange={(e) => set('servings', e.target.value)} /></label>
          <label className="field">Prep (min)<input type="number" inputMode="numeric" min={0} value={d.prep_min} onChange={(e) => set('prep_min', e.target.value)} /></label>
          <label className="field">Cook (min)<input type="number" inputMode="numeric" min={0} value={d.cook_min} onChange={(e) => set('cook_min', e.target.value)} /></label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Portions = how many this recipe makes as written. The scaler uses it to adjust every ingredient.</p>
        <div className="field">
          <span>A kid's portion is</span>
          <div className="chips" role="group" aria-label="Kid portion size">
            {KID_PORTIONS.map((k) => (
              <button key={k.value} type="button" className="chip" aria-pressed={d.kid_portion === k.value} onClick={() => set('kid_portion', k.value)}>
                {k.label}{k.value < 1 ? ' adult' : ' as adult'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="glass card" style={{ gap: 10 }}>
        <div className="spread"><h2 className="label">Tags</h2></div>
        <div className="chips">
          {d.tags.map((t) => (
            <button key={t} type="button" className="chip on" aria-label={`Remove tag ${t}`} onClick={() => toggleTag(t)}>{t} <span aria-hidden="true">×</span></button>
          ))}
          <button type="button" className="chip chip-dashed-text" aria-expanded={tagsOpen} onClick={() => setTagsOpen(!tagsOpen)}>{tagsOpen ? 'Done' : '+ Tag'}</button>
        </div>
        {tagsOpen && (
          <div className="stack tag-picker">
            {groups.map((g) => (
              <div key={g.name} className="stack" style={{ gap: 6 }}>
                <span className="tiny muted">{g.name}</span>
                <div className="chips">
                  {g.tags.map((t) => (
                    <button key={t.id} type="button" className="chip" aria-pressed={d.tags.includes(t.name)} onClick={() => toggleTag(t.name)}>{t.name}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="add-bar">
              <label htmlFor="new-tag" className="sr-only">New tag</label>
              <input id="new-tag" className="input" placeholder="New tag, e.g. Cookies" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void addTag())} />
              <button type="button" className="btn btn-primary btn-sm" disabled={!newTag.trim()} onClick={addTag}>Add</button>
            </div>
            <p className="tiny muted" style={{ margin: 0 }}>New tags show up as categories in Our Cookbook.</p>
          </div>
        )}
      </section>

      <section className="glass card" aria-label="Ingredients" style={{ gap: 8 }}>
        <h2 className="label">Ingredients</h2>
        {d.ingredients.map((r, i) => (
          <div key={i} className="ing-row">
            <input className="input amt" aria-label={`Amount ${i + 1}`} inputMode="text" placeholder="1 1/2" value={r.amount} onChange={(e) => setIng(i, { amount: e.target.value })} onPaste={(e) => pasteIngredients(i, e)} />
            <select className="input unit" aria-label={`Unit ${i + 1}`} value={r.unit} onChange={(e) => setIng(i, { unit: e.target.value })}>
              {UNIT_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.units.map((u) => <option key={u} value={u}>{u}</option>)}
                </optgroup>
              ))}
            </select>
            <input className="input name" aria-label={`Ingredient ${i + 1}`} placeholder="e.g. Beef chuck, cubed" value={r.name} onChange={(e) => setIng(i, { name: e.target.value })} onPaste={(e) => pasteIngredients(i, e)} />
            <button type="button" className="row-del" aria-label={`Remove ingredient ${i + 1}`} onClick={() => removeIng(i)}><IconTrash size={16} /></button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={addIng}>+ Add ingredient</button>
        <p className="tiny muted" style={{ margin: 0 }}>Tip: paste a whole list into any box and each line becomes a row. Anything after a comma is the prep note ("onion, diced").</p>
      </section>

      <section className="glass card" aria-label="Steps" style={{ gap: 8 }}>
        <h2 className="label">Steps</h2>
        {d.steps.map((s, i) => (
          <div key={i} className="step-row">
            <span className="step-num">{i + 1}</span>
            <div className="grow stack" style={{ gap: 6 }}>
              <textarea className="input" rows={2} aria-label={`Step ${i + 1}`} value={s.text} onChange={(e) => setStep(i, { text: e.target.value })} onPaste={(e) => pasteSteps(i, e)} />
              <label className="tiny muted timer-field">
                Timer
                <input className="input" type="number" inputMode="numeric" min={0} placeholder="min" aria-label={`Timer for step ${i + 1} (minutes)`} value={s.timer} onChange={(e) => setStep(i, { timer: e.target.value })} />
                minutes (optional)
              </label>
            </div>
            <button type="button" className="row-del" aria-label={`Remove step ${i + 1}`} onClick={() => set('steps', d.steps.length > 1 ? d.steps.filter((_, j) => j !== i) : [{ text: '', timer: '' }])}><IconTrash size={16} /></button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set('steps', [...d.steps, { text: '', timer: '' }])}>+ Add step</button>
      </section>

      <section className="glass card" aria-label="Nutrition" style={{ gap: 10 }}>
        <h2 className="label">Calories &amp; macros · per portion</h2>
        <div className="field-row">
          <label className="field">Portion weight<input type="number" inputMode="decimal" value={d.portion_weight} onChange={(e) => set('portion_weight', e.target.value)} /></label>
          <label className="field">Unit
            <select value={d.weight_unit} onChange={(e) => set('weight_unit', e.target.value as 'g' | 'oz')}><option value="g">g</option><option value="oz">oz</option></select>
          </label>
        </div>
        <div className="field-row three">
          <label className="field">Protein (g)<input type="number" inputMode="decimal" value={d.protein} onChange={(e) => set('protein', e.target.value)} /></label>
          <label className="field">Carbs (g)<input type="number" inputMode="decimal" value={d.carbs} onChange={(e) => set('carbs', e.target.value)} /></label>
          <label className="field">Fat (g)<input type="number" inputMode="decimal" value={d.fat} onChange={(e) => set('fat', e.target.value)} /></label>
        </div>
        <div className="spread"><span className="small">Calories (calculated)</span><span className="display" style={{ fontSize: 22 }}>{kcal} cal</span></div>
        <p className="tiny muted" style={{ margin: 0 }}>4 × {+d.protein || 0}g protein + 4 × {+d.carbs || 0}g carbs + 9 × {+d.fat || 0}g fat{d.portion_weight ? `, for a ${d.portion_weight} ${d.weight_unit} portion` : ''}</p>
      </section>

      <section className="glass card" style={{ gap: 12 }}>
        <label className="field">Reheat note (for prep labels)<input value={d.reheat} onChange={(e) => set('reheat', e.target.value)} placeholder="e.g. 2 min in the microwave, covered" /></label>
        <label className="field">Notes<textarea rows={3} value={d.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Family tips, substitutions, where it came from…" /></label>
        <label className="field">Source link (optional)<input type="url" inputMode="url" value={d.source_url} onChange={(e) => set('source_url', e.target.value)} placeholder="https://" /></label>
      </section>

      {error && <p role="alert" style={{ margin: 0, color: 'var(--danger)' }}>{error}</p>}
      <button type="button" className="btn btn-primary btn-block" disabled={saving} onClick={save}>{saving ? 'Saving…' : id ? 'Save recipe' : 'Add to Our Cookbook'}</button>
      {id && !confirmDelete && <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Delete recipe</button>}
      {id && confirmDelete && (
        <Confirm
          text={`Delete ${d.title || 'this recipe'}? Meals already planned keep its name.`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await deleteRecipe(id);
            toast({ text: 'Recipe deleted' });
            nav('/recipes', { replace: true });
          }}
        />
      )}
    </Screen>
  );
}
