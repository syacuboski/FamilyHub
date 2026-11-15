// Saving recipes: the recipe record, its ingredient rows (diffed against what
// was there before) and the photo. Text saves go through the offline outbox;
// the photo needs a connection because it is uploaded straight to PocketBase.
import { add, patch, remove, sync } from './sync';
import { db } from './sync/db';
import { pb } from './pb';
import { findOrCreateItem } from './actions';
import { parseIngredientLine } from './parse';
import { parseQty } from './scale';
import type { Recipe, RecipeIngredient, Step } from './types';

export interface IngredientDraft {
  /** existing row id, or '' for a new row */
  id: string;
  amount: string;
  unit: string;
  /** "Beef chuck, cubed": text after the first comma becomes the prep note */
  name: string;
}

export interface RecipeDraft {
  title: string;
  servings: string;
  prep_min: string;
  cook_min: string;
  kid_portion: number;
  tags: string[];
  ingredients: IngredientDraft[];
  steps: { text: string; timer: string }[];
  portion_weight: string;
  weight_unit: 'g' | 'oz';
  protein: string;
  carbs: string;
  fat: string;
  reheat: string;
  notes: string;
  source_url: string;
}

export const emptyDraft = (): RecipeDraft => ({
  title: '', servings: '4', prep_min: '', cook_min: '', kid_portion: 0.5, tags: [],
  ingredients: [{ id: '', amount: '', unit: 'whole', name: '' }],
  steps: [{ text: '', timer: '' }],
  portion_weight: '', weight_unit: 'g', protein: '', carbs: '', fat: '', reheat: '', notes: '', source_url: '',
});

const num = (s: string): number => {
  const v = parseFloat(String(s).replace(',', '.'));
  return isNaN(v) ? 0 : v;
};

/** Amount box text → number (accepts "1 1/2", "½", "2.5"); null when blank or "to taste". */
export function amountToQty(amount: string): number | null {
  if (!amount.trim()) return null;
  const q = parseQty(amount);
  return isNaN(q) ? null : q;
}

/** Number → friendly amount text for the edit form ("1.5" → "1 1/2"). */
export function qtyToAmount(q: number | null | undefined): string {
  if (q === null || q === undefined || q === 0) return '';
  const w = Math.floor(q);
  const f = +(q - w).toFixed(3);
  const fr: Record<string, string> = { '0.25': '1/4', '0.5': '1/2', '0.75': '3/4', '0.333': '1/3', '0.667': '2/3', '0.125': '1/8' };
  const frac = fr[String(f)];
  if (f === 0) return String(w);
  if (frac) return w ? `${w} ${frac}` : frac;
  return String(+q.toFixed(2));
}

export function draftFrom(r: Recipe, ings: RecipeIngredient[]): RecipeDraft {
  const rows = ings.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
  return {
    title: r.title,
    servings: r.servings ? String(r.servings) : '',
    prep_min: r.prep_min ? String(r.prep_min) : '',
    cook_min: r.cook_min ? String(r.cook_min) : '',
    kid_portion: r.kid_portion || 0.5,
    tags: r.tags || [],
    ingredients: rows.length
      ? rows.map((i) => ({ id: i.id, amount: qtyToAmount(i.qty), unit: i.unit || 'whole', name: i.prep ? `${i.name}, ${i.prep}` : i.name }))
      : [{ id: '', amount: '', unit: 'whole', name: '' }],
    steps: (r.steps && r.steps.length ? r.steps : [{ text: '' }]).map((s) => ({ text: s.text, timer: s.timer_min ? String(s.timer_min) : '' })),
    portion_weight: r.portion_weight ? String(r.portion_weight) : '',
    weight_unit: (r.weight_unit as 'g' | 'oz') || 'g',
    protein: r.protein ? String(r.protein) : '',
    carbs: r.carbs ? String(r.carbs) : '',
    fat: r.fat ? String(r.fat) : '',
    reheat: r.reheat || '',
    notes: r.notes || '',
    source_url: r.source_url || '',
  };
}

/** Lines pasted into an ingredient box → rows ("2 lb beef chuck, cubed"). */
export function rowsFromPaste(text: string): IngredientDraft[] {
  return text
    .split(/\r?\n/)
    .map((l) => parseIngredientLine(l))
    .filter((p): p is NonNullable<typeof p> => !!p && !!p.name)
    .map((p) => ({ id: '', amount: p.qty === null ? '' : qtyToAmount(p.qty), unit: p.unit || 'whole', name: p.prep ? `${p.name}, ${p.prep}` : p.name }));
}

export function validate(d: RecipeDraft): string | null {
  if (!d.title.trim()) return 'Give the recipe a name.';
  if (!(num(d.servings) > 0)) return 'Portions should be a number, like 4.';
  return null;
}

/** Create or update a recipe and its ingredients. Returns the recipe id. */
export async function saveRecipe(d: RecipeDraft, existingId?: string): Promise<string> {
  const steps: Step[] = d.steps
    .map((s) => ({ text: s.text.trim(), ...(num(s.timer) > 0 ? { timer_min: num(s.timer) } : {}) }))
    .filter((s) => s.text);
  const data: Partial<Recipe> = {
    title: d.title.trim(),
    servings: num(d.servings),
    prep_min: num(d.prep_min),
    cook_min: num(d.cook_min),
    kid_portion: d.kid_portion,
    tags: d.tags,
    steps,
    portion_weight: num(d.portion_weight),
    weight_unit: d.weight_unit,
    protein: num(d.protein),
    carbs: num(d.carbs),
    fat: num(d.fat),
    reheat: d.reheat.trim(),
    notes: d.notes.trim(),
    source_url: d.source_url.trim(),
  };
  let id = existingId;
  if (id) await patch('recipes', id, data);
  else id = await add('recipes', data as Omit<Recipe, 'id' | 'household'>);

  // ingredients: update kept rows, add new ones, delete removed ones
  const before = await db.t('recipe_ingredients').filter((i) => i.recipe === id).toArray();
  const keep = new Set<string>();
  let sort = 0;
  for (const row of d.ingredients) {
    const raw = row.name.trim();
    if (!raw) continue;
    const comma = raw.indexOf(',');
    const name = (comma > 0 ? raw.slice(0, comma) : raw).trim();
    const prep = comma > 0 ? raw.slice(comma + 1).trim() : '';
    const fields = { name, prep, qty: amountToQty(row.amount), unit: row.unit, sort: sort++ };
    const old = row.id ? before.find((b) => b.id === row.id) : undefined;
    if (old) {
      keep.add(old.id);
      const item = old.name.toLowerCase() === name.toLowerCase() && old.item ? old.item : await findOrCreateItem(name);
      await patch('recipe_ingredients', old.id, { ...fields, item });
    } else {
      const item = await findOrCreateItem(name);
      await add('recipe_ingredients', { ...fields, recipe: id, item } as Omit<RecipeIngredient, 'id' | 'household'>);
    }
  }
  for (const b of before) if (!keep.has(b.id)) await remove('recipe_ingredients', b.id);
  return id;
}

export async function deleteRecipe(id: string) {
  const ings = await db.t('recipe_ingredients').filter((i) => i.recipe === id).toArray();
  for (const i of ings) await remove('recipe_ingredients', i.id);
  // menu entries that point at it become free text so the menu keeps its history
  const menu = await db.t('menu_entries').filter((m) => m.recipe === id).toArray();
  const r = await db.t('recipes').get(id);
  for (const m of menu) await patch('menu_entries', m.id, { recipe: '', text: r?.title || 'Recipe' });
  await remove('recipes', id);
}

/** Shrink a phone photo (often 4–12 MB) to ≤1600 px JPEG before upload. */
export async function shrinkPhoto(file: File, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // browser can't decode it (rare): send as-is, the server checks size and type
  }
}

/** Upload (or clear with null) a recipe's photo. Needs a connection. */
export async function setRecipePhoto(id: string, file: File | null): Promise<void> {
  if (!navigator.onLine) throw new Error('offline');
  await sync.flush(); // the recipe itself has to reach the server first
  const fd = new FormData();
  if (file) fd.append('photo', await shrinkPhoto(file), 'photo.jpg');
  else fd.append('photo', '');
  const saved = (await pb.collection('recipes').update(id, fd)) as unknown as Record<string, unknown>;
  const { expand, ...rest } = saved as Record<string, unknown> & { expand?: unknown };
  void expand;
  await db.t('recipes').put(rest as never);
}
