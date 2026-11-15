// Menu → Shopping: which recipe ingredients are missing from inventory, and
// merging them into a list without duplicating what's already there.
import type { InventoryRec, ListItem, RecipeIngredient } from './types';

const key = (s: string) => s.trim().toLowerCase().replace(/s$/, '');

export interface Need {
  name: string;
  item?: string;
  qty: number;
  unit: string;
  inStock: boolean;
}

/** Pantry staples measured in tiny amounts never trigger a purchase. */
const TINY = new Set(['pinch', 'dash', 'to taste']);

export function stockFor(ing: Pick<RecipeIngredient, 'name' | 'item'>, inventory: InventoryRec[]): InventoryRec | undefined {
  return inventory.find((r) => (ing.item && r.item === ing.item) || key(r.name) === key(ing.name));
}

/** Scale each ingredient by `factor` and mark whether inventory covers it. */
export function needsFor(ings: RecipeIngredient[], factor: number, inventory: InventoryRec[]): Need[] {
  return ings
    .slice()
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map((i) => {
      const stock = stockFor(i, inventory);
      const qty = (i.qty || 0) * factor;
      return {
        name: i.name,
        item: i.item || stock?.item,
        qty,
        unit: i.unit,
        inStock: TINY.has(i.unit) || (!!stock && stock.qty > 0),
      };
    });
}

export interface ListAddition {
  /** existing unchecked list row to bump, if any */
  existing?: ListItem;
  name: string;
  item?: string;
  qty: number;
  unit: string;
}

/**
 * Turn missing needs into list additions. Rows already on the list (unchecked)
 * are left alone rather than duplicated. Shopping quantities round up.
 */
export function additionsFor(needs: Need[], listRows: ListItem[]): ListAddition[] {
  const out: ListAddition[] = [];
  for (const n of needs) {
    if (n.inStock) continue;
    const existing = listRows.find((r) => !r.checked && ((n.item && r.item === n.item) || key(r.name) === key(n.name)));
    if (existing) continue;
    const countUnit = ['whole', 'clove', 'head', 'bunch', 'can', 'jar', 'package', 'stick', 'slice', 'sprig', ''].includes(n.unit);
    // count-type units: buy whole things ("2½ cloves garlic" → 1 head would be smarter; keep simple: 1)
    const qty = countUnit ? (n.unit === 'clove' || n.unit === 'sprig' || n.unit === 'slice' ? 1 : Math.max(1, Math.ceil(n.qty))) : Math.max(1, Math.ceil(n.qty * 4) / 4);
    const unit = countUnit ? '' : n.unit;
    out.push({ existing, name: n.name, item: n.item, qty, unit });
  }
  return out;
}

/**
 * Combine needs from several meals: the same ingredient in the same unit adds
 * up ("1 lb beef" + "2 lb beef" = 3 lb); it counts as in stock only if every
 * meal found it in stock.
 */
export function mergeNeeds(lists: Need[][]): Need[] {
  const out = new Map<string, Need>();
  for (const needs of lists) {
    for (const n of needs) {
      const k = `${n.item || key(n.name)}|${n.unit}`;
      const cur = out.get(k);
      if (cur) out.set(k, { ...cur, qty: cur.qty + n.qty, inStock: cur.inStock && n.inStock });
      else out.set(k, { ...n });
    }
  }
  return [...out.values()];
}
