import { describe, expect, it } from 'vitest';
import { additionsFor, mergeNeeds, type Need } from '../../src/lib/missing';
import { ingredientQty, stepUses } from '../../src/features/recipes/ingredientText';
import { planFromParams, planToQuery, planTotals, describePlan } from '../../src/lib/headcount';

const need = (name: string, qty: number, unit: string, inStock = false, item = ''): Need => ({ name, qty, unit, inStock, item: item || undefined });

describe('week grocery list', () => {
  it('adds up the same ingredient across meals and keeps different units apart', () => {
    const merged = mergeNeeds([
      [need('Ground beef', 1, 'lb'), need('Onion', 1, 'whole'), need('Salt', 0, 'to taste', true)],
      [need('Ground beef', 2, 'lb'), need('Onion', 0.5, 'whole', true), need('Beef broth', 3, 'cup')],
      [need('ground beef', 8, 'oz')],
    ]);
    const by = Object.fromEntries(merged.map((n) => [`${n.name.toLowerCase()}|${n.unit}`, n]));
    expect(by['ground beef|lb'].qty).toBe(3);
    expect(by['ground beef|oz'].qty).toBe(8);
    expect(by['onion|whole']).toMatchObject({ qty: 1.5, inStock: false }); // one meal found it, one didn't → still need it
    const adds = additionsFor(merged, []);
    expect(adds.map((a) => `${a.name} ${a.qty} ${a.unit}`).sort()).toEqual(['Beef broth 3 cup', 'Ground beef 3 lb', 'Onion 2 ', 'ground beef 8 oz']);
  });
});

describe('cook mode', () => {
  it('highlights the ingredients a step mentions', () => {
    expect(stepUses('Brown the sausage, then strain it out', 'Italian Venison Sausage')).toBe(true);
    expect(stepUses('Sauté onion and mushrooms with Italian seasoning', 'Diced Mushrooms')).toBe(true);
    expect(stepUses('Sauté onion and mushrooms', 'Onions')).toBe(true);
    expect(stepUses('Whisk in flour', 'Garlic')).toBe(false);
    expect(stepUses('Season to taste', 'Italian Seasoning')).toBe(false); // "italian" alone isn't enough; "seasoning" ≠ "season"
    expect(stepUses('Add the potatoes', 'Baby potatoes')).toBe(true);
  });
  it('shows scaled amounts with sensible units', () => {
    expect(ingredientQty({ qty: 2, unit: 'lb' }, 2.5 / 4)).toBe('1¼ lb');
    expect(ingredientQty({ qty: 4, unit: 'clove' }, 0.625)).toBe('2½ cloves');
    expect(ingredientQty({ qty: 1, unit: 'clove' }, 1)).toBe('1 clove');
    expect(ingredientQty({ qty: 2, unit: 'whole' }, 1.5)).toBe('3');
    expect(ingredientQty({ qty: 0, unit: 'to taste' }, 3)).toBe('to taste');
    expect(ingredientQty({ qty: 1, unit: 'cup' }, 2)).toBe('2 cups');
  });
});

describe('headcount plan', () => {
  it('round-trips through the URL and totals adult-portion equivalents', () => {
    const p = planFromParams(new URLSearchParams('a=2&k=1&pa=4&pk=2'));
    expect(p).toEqual({ adults: 2, kids: 1, prepA: 4, prepK: 2 });
    expect(planToQuery(p)).toBe('a=2&k=1&pa=4&pk=2');
    expect(planTotals(p, 0.5)).toMatchObject({ tonight: 2.5, prep: 5, total: 7.5, containers: 6 });
    expect(describePlan(p)).toBe('2 adults + 1 kid');
    expect(describePlan({ adults: 1, kids: 0, prepA: 0, prepK: 0 })).toBe('1 adult');
  });
});
