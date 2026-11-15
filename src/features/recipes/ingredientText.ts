import { fmtQty } from '../../lib/scale';
import type { RecipeIngredient } from '../../lib/types';

const PLURAL: Record<string, string> = { clove: 'cloves', slice: 'slices', stick: 'sticks', can: 'cans', jar: 'jars', package: 'packages', bunch: 'bunches', head: 'heads', sprig: 'sprigs', cup: 'cups' };

/** "1¼ lb", "2½ cloves", "to taste", "3" (count without a unit) */
export function ingredientQty(i: Pick<RecipeIngredient, 'qty' | 'unit'>, factor = 1): string {
  if (i.unit === 'to taste') return 'to taste';
  if (i.unit === 'pinch' || i.unit === 'dash') return i.qty ? `${fmtQty(i.qty * factor)} ${i.unit}` : i.unit;
  if (!i.qty) return '';
  const q = i.qty * factor;
  const amount = fmtQty(q);
  if (!i.unit || i.unit === 'whole') return amount;
  const unit = q > 1 && PLURAL[i.unit] ? PLURAL[i.unit] : i.unit;
  return `${amount} ${unit}`;
}

/** Does this step mention this ingredient? ("Brown the sausage" ↔ "Italian venison sausage") */
export function stepUses(step: string, ingredientName: string): boolean {
  const text = ` ${step.toLowerCase().replace(/[^a-z\s]/g, ' ')} `;
  const words = ingredientName
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !['fresh', 'dried', 'ground', 'large', 'small', 'medium', 'italian', 'chopped', 'whole', 'extra', 'virgin', 'light', 'heavy'].includes(w));
  return words.some((w) => {
    const stem = w.replace(/(es|s)$/, '');
    return text.includes(` ${w} `) || text.includes(` ${stem} `) || text.includes(` ${stem}s `) || text.includes(` ${stem}es `);
  });
}
