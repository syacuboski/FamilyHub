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

// Words that describe an ingredient (or double as cooking verbs) rather than name it:
// "Brown the sausage" must not match "brown sugar", "dice the onion" not "diced tomatoes".
const NOT_THE_FOOD = new Set([
  'fresh', 'dried', 'ground', 'large', 'small', 'medium', 'italian', 'chopped', 'whole', 'extra', 'virgin', 'light', 'heavy',
  'brown', 'white', 'black', 'green', 'yellow', 'golden', 'sweet', 'salted', 'unsalted', 'frozen', 'canned', 'diced', 'sliced',
  'minced', 'shredded', 'grated', 'toasted', 'roasted', 'smoked', 'boneless', 'skinless', 'baby', 'plain', 'low', 'sodium',
  'reduced', 'fat', 'free', 'organic', 'raw', 'cooked', 'softened', 'melted', 'packed', 'fine', 'coarse', 'kosher',
]);

const words = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);

/** Does this step mention this ingredient? ("Brown the sausage" ↔ "Italian venison sausage") */
export function stepUses(step: string, ingredientName: string): boolean {
  const text = ` ${words(step).join(' ')} `;
  const name = words(ingredientName);
  // the food words of the name; the last word ("sugar", "oil") counts even when short
  const food = name.filter((w, i) => !NOT_THE_FOOD.has(w) && (w.length >= 4 || (i === name.length - 1 && w.length >= 3)));
  return food.some((w) => {
    const stem = w.replace(/(es|s)$/, '');
    return [w, stem, `${stem}s`, `${stem}es`].some((f) => f.length >= 3 && text.includes(` ${f} `));
  });
}
