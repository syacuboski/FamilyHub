import { describe, expect, it, vi } from 'vitest';

// recipes.ts talks to PocketBase and the sync layer; these tests only cover its pure helpers.
vi.mock('../../src/lib/sync', () => ({ add: vi.fn(), patch: vi.fn(), remove: vi.fn(), sync: {} }));
vi.mock('../../src/lib/sync/db', () => ({ db: {} }));
vi.mock('../../src/lib/pb', () => ({ pb: {} }));
vi.mock('../../src/lib/actions', () => ({ findOrCreateItem: vi.fn() }));

const { amountToQty, qtyToAmount, rowsFromPaste, draftFrom, validate, emptyDraft } = await import('../../src/lib/recipes');

describe('recipe entry helpers', () => {
  it('reads and writes friendly amounts', () => {
    expect(amountToQty('1 1/2')).toBe(1.5);
    expect(amountToQty('½')).toBe(0.5);
    expect(amountToQty('')).toBeNull();
    expect(amountToQty('a pinch')).toBeNull();
    expect(qtyToAmount(1.5)).toBe('1 1/2');
    expect(qtyToAmount(0.25)).toBe('1/4');
    expect(qtyToAmount(3)).toBe('3');
    expect(qtyToAmount(0.4)).toBe('0.4');
    expect(qtyToAmount(null)).toBe('');
  });

  it('turns a pasted list into rows, keeping prep notes after the comma', () => {
    const rows = rowsFromPaste('2 lb beef chuck, cubed\n4 carrots\n\n3 cups beef broth\nSalt to taste');
    expect(rows).toEqual([
      { id: '', amount: '2', unit: 'lb', name: 'Beef chuck, cubed' },
      { id: '', amount: '4', unit: 'whole', name: 'Carrots' },
      { id: '', amount: '3', unit: 'cup', name: 'Beef broth' },
      { id: '', amount: '', unit: 'to taste', name: 'Salt' },
    ]);
  });

  it('loads a saved recipe back into the form in the right order', () => {
    const r = { id: 'r', household: 'h', title: 'Stew', servings: 6, prep_min: 20, cook_min: 150, tags: ['Dinner'], steps: [{ text: 'Brown', timer_min: 10 }], kid_portion: 0.5, protein: 30 };
    const ings = [
      { id: 'b', household: 'h', recipe: 'r', name: 'Carrots', qty: 4, unit: 'whole', sort: 1 },
      { id: 'a', household: 'h', recipe: 'r', name: 'Beef chuck', prep: 'cubed', qty: 2, unit: 'lb', sort: 0 },
    ];
    const d = draftFrom(r as never, ings as never);
    expect(d.ingredients.map((i) => i.name)).toEqual(['Beef chuck, cubed', 'Carrots']);
    expect(d.steps).toEqual([{ text: 'Brown', timer: '10' }]);
    expect(d.servings).toBe('6');
    expect(d.protein).toBe('30');
  });

  it('asks for a name and a portion count', () => {
    expect(validate(emptyDraft())).toMatch(/name/);
    expect(validate({ ...emptyDraft(), title: 'Stew', servings: '0' })).toMatch(/Portions/);
    expect(validate({ ...emptyDraft(), title: 'Stew', servings: '6' })).toBeNull();
  });
});
