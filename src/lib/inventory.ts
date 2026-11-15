// Inventory rules shared by the Inventory screen, Today and the diaper bag.
import { add, patch } from './sync';
import { db } from './sync/db';
import { householdId } from './pb';
import { daysBetween, parseYmd, today, toPB } from './dates';
import type { BagItem, InventoryRec, Location } from './types';

/** Out when nothing is left; Low at or below the low mark (only if a low mark is set). */
export function stockStatus(i: Pick<InventoryRec, 'qty' | 'low'>): 'out' | 'low' | 'ok' {
  if ((i.qty || 0) <= 0) return 'out';
  if ((i.low || 0) > 0 && i.qty <= i.low) return 'low';
  return 'ok';
}

export const needsRestock = (i: Pick<InventoryRec, 'qty' | 'low'>) => stockStatus(i) !== 'ok';

/** Fill of the stock bar: qty against "full" (par), or against twice the low mark. */
export function stockPct(i: Pick<InventoryRec, 'qty' | 'low' | 'par'>): number {
  const full = i.par > 0 ? i.par : Math.max(1, (i.low || 0) * 2, i.qty || 0);
  return Math.max(0, Math.min(100, Math.round(((i.qty || 0) / full) * 100)));
}

/** "Use by Nov 20" / "Use today" / "Expired 2 days ago"; warn when ≤ 3 days. */
export function expiryText(expires: string | undefined, now = today()): { text: string; warn: boolean } | null {
  if (!expires) return null;
  const d = daysBetween(now, parseYmd(expires));
  if (d < 0) return { text: `Expired ${-d} day${d === -1 ? '' : 's'} ago`, warn: true };
  if (d === 0) return { text: 'Use today', warn: true };
  if (d === 1) return { text: 'Use by tomorrow', warn: true };
  const dt = parseYmd(expires);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getMonth()];
  return { text: `Use by ${mon} ${dt.getDate()}`, warn: d <= 3 };
}

/** How much to buy to get back to "full" (at least 1). */
export function restockQty(i: Pick<InventoryRec, 'qty' | 'low' | 'par'>): number {
  const full = i.par > 0 ? i.par : Math.max((i.low || 0) + 1, 1);
  return Math.max(1, Math.ceil(full - Math.max(0, i.qty || 0)));
}

/**
 * One "last checked" row per household + location. A fixed id per location
 * means both phones update the same row instead of racing to create two.
 */
const LOC_CODE: Record<Location, string> = { pantry: 'pa', fridge: 'fr', freezer: 'fz', kids: 'ki' };

export function checkId(location: Location): string {
  return (LOC_CODE[location] + 'chk' + householdId()).slice(0, 15).toLowerCase();
}

export async function markChecked(location: Location) {
  const id = checkId(location);
  const existing = await db.t('inv_checks').get(id);
  if (existing) await patch('inv_checks', id, { checked_at: toPB(new Date()) });
  else await add('inv_checks', { id, location, checked_at: toPB(new Date()) });
}

/** Which inventory row a diaper-bag item draws from: its link, else a name match in Kids. */
export function bagStock(b: BagItem, inventory: InventoryRec[]): InventoryRec | undefined {
  if (b.inventory) return inventory.find((i) => i.id === b.inventory);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const bag = norm(b.name).replace(/s$/, '');
  if (bag.length < 3) return undefined;
  // 3: same thing ("Wipes" ↔ Wipes); 2: same thing plus a size or kind ("Diapers" ↔ Diapers, size 3;
  // "Formula" ↔ Baby formula). "Diapers" must not match "Diaper cream".
  const score = (name: string) => {
    const n = norm(name);
    if (n.replace(/s$/, '') === bag) return 3;
    if (n.startsWith(bag)) {
      const rest = n.slice(bag.length).replace(/^s\b/, '').trim();
      if (!rest) return 3;
      if (/^(size|sz|\d)/.test(rest)) return 2;
    }
    if (n.replace(/s$/, '').endsWith(` ${bag}`)) return 2;
    return 0;
  };
  let best: InventoryRec | undefined;
  let bestScore = 1;
  for (const i of inventory.filter((x) => x.location === 'kids')) {
    const s = score(i.name);
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  }
  return best;
}
