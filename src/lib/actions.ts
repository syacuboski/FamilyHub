// Cross-module actions shared by several screens. All go through the sync
// layer, so they work offline and reach the other phone when back online.
import { db } from './sync/db';
import { add, patch, remove } from './sync';
import { currentUser } from './pb';
import { guessCategory, guessLocation } from './categories';
import { nextDue } from './recurrence';
import { toPB, ymd, today } from './dates';
import type { InventoryRec, Item, List, ListItem, Location, Store, Task } from './types';
import { additionsFor, mergeNeeds, needsFor, type ListAddition } from './missing';

const key = (s: string) => s.trim().toLowerCase();

/** The shared catalog record for a name ("milk" in a recipe, on a list and in the fridge). */
export async function findOrCreateItem(name: string, category?: string, unit = ''): Promise<string> {
  const k = key(name);
  const all = await db.t('items').toArray();
  const hit = all.find((i) => (i.name_key || key(i.name)) === k);
  if (hit) return hit.id;
  return add('items', { name: name.trim(), name_key: k, category: category || guessCategory(name), default_unit: unit } as Omit<Item, 'id' | 'household'>);
}

export async function defaultList(): Promise<List | undefined> {
  const lists = await db.t('lists').toArray();
  return lists.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[0];
}

/** Add to a list, or bump the quantity if the same thing is already unchecked there. */
export async function addToList(listId: string, it: { name: string; qty?: number; unit?: string; category?: string; source?: string; item?: string }): Promise<string> {
  const rows = await db.t('list_items').where('id').notEqual('').toArray();
  const existing = rows.find((r) => r.list === listId && !r.checked && key(r.name) === key(it.name));
  if (existing) {
    await patch('list_items', existing.id, { qty: (existing.qty || 1) + (it.qty || 1), source: existing.source || it.source });
    return existing.id;
  }
  const category = it.category || guessCategory(it.name);
  const item = it.item || (await findOrCreateItem(it.name, category, it.unit));
  return add('list_items', {
    list: listId,
    item,
    name: it.name.trim(),
    qty: it.qty || 1,
    unit: it.unit || '',
    category,
    checked: false,
    source: it.source || '',
  } as Omit<ListItem, 'id' | 'household'>);
}

/** Menu → Shopping for one recipe at a given portion count. Returns how many were added. */
export async function addMissingForRecipe(recipeId: string, totalPortions: number, listId?: string): Promise<number> {
  const recipe = await db.t('recipes').get(recipeId);
  if (!recipe) return 0;
  const ings = await db.t('recipe_ingredients').filter((i) => i.recipe === recipeId).toArray();
  const inv = await db.t('inventory').toArray();
  const list = listId ? await db.t('lists').get(listId) : await defaultList();
  if (!list) return 0;
  const rows = await db.t('list_items').filter((r) => r.list === list.id).toArray();
  const factor = recipe.servings ? totalPortions / recipe.servings : 1;
  const adds = additionsFor(needsFor(ings, factor, inv), rows);
  return addAdditions(list.id, adds, shortTitle(recipe.title));
}

/** "Sheet-pan lemon chicken & vegetables" → "Lemon chicken" style tag for list rows. */
export function shortTitle(t: string): string {
  const s = t.replace(/^(sheet-pan|one-pot|easy|quick|homemade|grandma's|mom's)\s+/i, '').split(/\s+(&|and|with)\s+/i)[0];
  return s.length > 22 ? s.slice(0, 21) + '…' : s.charAt(0).toUpperCase() + s.slice(1);
}

export async function addAdditions(listId: string, adds: ListAddition[], source: string): Promise<number> {
  for (const a of adds) await addToList(listId, { name: a.name, qty: a.qty, unit: a.unit, item: a.item, source });
  return adds.length;
}

export async function setChecked(row: ListItem, checked: boolean) {
  const me = currentUser();
  let order = 0;
  if (checked) {
    const rows = await db.t('list_items').toArray();
    order = Math.max(0, ...rows.filter((r) => r.list === row.list && r.checked).map((r) => r.check_order || 0)) + 1;
  }
  await patch('list_items', row.id, {
    checked,
    checked_by: checked ? me?.id || '' : '',
    checked_at: checked ? toPB(new Date()) : '',
    check_order: checked ? order : 0,
  });
}

export interface Bought { row: ListItem; location: Location | 'skip' }

/**
 * Finish a shopping trip: restock Inventory with what was bought, learn the
 * store's aisle order from the order things were checked, and clear the
 * checked rows. Unbought rows stay on the list.
 */
export async function finishTrip(bought: Bought[], storeId?: string) {
  const inv = await db.t('inventory').toArray();
  for (const b of bought) {
    if (b.location !== 'skip') await restock(inv, b.row, b.location);
    await remove('list_items', b.row.id);
  }
  if (storeId) {
    const store = await db.t('stores').get(storeId);
    if (store) {
      const seen: string[] = [];
      for (const b of bought.slice().sort((x, y) => (x.row.check_order || 0) - (y.row.check_order || 0))) {
        if (!seen.includes(b.row.category)) seen.push(b.row.category);
      }
      // blend with what we learned before: new observations first, keep the rest
      const merged = seen.concat((store.category_order || []).filter((c) => !seen.includes(c)));
      await patch('stores', store.id, { category_order: merged } as Partial<Store>);
    }
  }
}

async function restock(inv: InventoryRec[], row: ListItem, location: Location) {
  const hit = inv.find((r) => (row.item && r.item === row.item) || key(r.name) === key(row.name));
  const qty = row.qty || 1;
  if (hit) {
    await patch('inventory', hit.id, { qty: (hit.qty || 0) + qty, location: hit.location || location });
    hit.qty = (hit.qty || 0) + qty;
  } else {
    const id = await add('inventory', {
      item: row.item || '',
      name: row.name,
      location,
      qty,
      unit: row.unit || '',
      low: 0,
      par: qty,
    } as Omit<InventoryRec, 'id' | 'household'>);
    inv.push({ id, household: '', item: row.item, name: row.name, location, qty, unit: row.unit, low: 0, par: qty });
  }
}

export const suggestedLocation = (row: ListItem): Location => guessLocation(row.category);

/** Tick a task. Recurring chores roll forward to their next date instead of closing. */
export async function completeTask(t: Task): Promise<{ undo: () => Promise<void>; next?: string }> {
  const prev = { done: t.done, due: t.due, last_done: t.last_done || '', done_at: t.done_at || '' };
  if (t.rrule) {
    const next = nextDue(t.due, t.rrule);
    await patch('tasks', t.id, { due: next, last_done: ymd(today()), done: false });
    return { next, undo: () => patch('tasks', t.id, prev) };
  }
  await patch('tasks', t.id, { done: true, done_at: toPB(new Date()) });
  return { undo: () => patch('tasks', t.id, prev) };
}

export async function reopenTask(t: Task) {
  await patch('tasks', t.id, { done: false, done_at: '' });
}

/**
 * Menu → Grocery for a set of planned meals (e.g. the rest of this week):
 * scale each recipe to its headcount + prep, combine, skip what's in stock or
 * already on the list. Returns how many items were added.
 */
export async function addMealsToGrocery(entries: import('./types').MenuEntry[]): Promise<{ added: number; meals: number }> {
  const list = await defaultList();
  if (!list) return { added: 0, meals: 0 };
  const inv = await db.t('inventory').toArray();
  const ingsAll = await db.t('recipe_ingredients').toArray();
  const recipes = await db.t('recipes').toArray();
  const per: ReturnType<typeof needsFor>[] = [];
  let meals = 0;
  for (const e of entries) {
    const r = recipes.find((x) => x.id === e.recipe);
    if (!r) continue;
    const kid = r.kid_portion ?? 0.5;
    const total = (e.adults ?? 2) + (e.kids ?? 0) * kid + (e.prep_adult || 0) + (e.prep_kid || 0) * kid;
    if (total <= 0) continue;
    per.push(needsFor(ingsAll.filter((i) => i.recipe === r.id), r.servings ? total / r.servings : 1, inv));
    meals++;
  }
  const rows = await db.t('list_items').filter((r) => r.list === list.id).toArray();

  const adds = additionsFor(mergeNeeds(per), rows);
  await addAdditions(list.id, adds, 'This week\'s menu');
  return { added: adds.length, meals };
}
