import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/sync', () => ({ add: vi.fn(), patch: vi.fn() }));
vi.mock('../../src/lib/sync/db', () => ({ db: {} }));
vi.mock('../../src/lib/pb', () => ({ householdId: () => 'abcdefghijklmno' }));

const { stockStatus, stockPct, expiryText, restockQty, bagStock, checkId } = await import('../../src/lib/inventory');

const inv = (name: string, qty: number, low = 0, par = 0, location = 'kids') => ({ id: name, household: 'h', name, qty, low, par, unit: '', location }) as never;

describe('inventory rules', () => {
  it('knows out, low and ok', () => {
    expect(stockStatus({ qty: 0, low: 0 })).toBe('out');
    expect(stockStatus({ qty: 6, low: 10 })).toBe('low');
    expect(stockStatus({ qty: 10, low: 10 })).toBe('low');
    expect(stockStatus({ qty: 3, low: 0 })).toBe('ok'); // no low mark set → never "low"
    expect(stockStatus({ qty: 12, low: 4 })).toBe('ok');
  });
  it('fills the bar toward full stock', () => {
    expect(stockPct({ qty: 6, low: 10, par: 40 })).toBe(15);
    expect(stockPct({ qty: 50, low: 10, par: 40 })).toBe(100);
    expect(stockPct({ qty: 1, low: 1, par: 0 })).toBe(50); // no "full": twice the low mark
  });
  it('buys back up to full', () => {
    expect(restockQty({ qty: 6, low: 10, par: 40 })).toBe(34);
    expect(restockQty({ qty: 1, low: 2, par: 0 })).toBe(2);
    expect(restockQty({ qty: 5, low: 0, par: 0 })).toBe(1);
  });
  it('describes use-by dates and warns close to them', () => {
    const now = new Date(2026, 10, 15);
    expect(expiryText('2026-11-14', now)).toEqual({ text: 'Expired 1 day ago', warn: true });
    expect(expiryText('2026-11-15', now)).toEqual({ text: 'Use today', warn: true });
    expect(expiryText('2026-11-16', now)).toEqual({ text: 'Use by tomorrow', warn: true });
    expect(expiryText('2026-11-18', now)).toEqual({ text: 'Use by Nov 18', warn: true });
    expect(expiryText('2026-11-25', now)).toEqual({ text: 'Use by Nov 25', warn: false });
    expect(expiryText('', now)).toBeNull();
  });
  it('finds the Kids supply behind a diaper bag item', () => {
    // Diaper cream listed first on purpose: "Diapers" must still find "Diapers, size 3"
    const stock = [inv('Diaper cream', 2, 1, 3), inv('Diapers, size 3', 6, 10, 40), inv('Wipes', 1, 2, 6), inv('Baby formula', 1, 1, 2), inv('Rice', 1, 1, 2, 'pantry')];
    expect((bagStock({ name: 'Diapers' } as never, stock) as { name: string } | undefined)?.name).toBe('Diapers, size 3');
    expect((bagStock({ name: 'Wipes' } as never, stock) as { name: string } | undefined)?.name).toBe('Wipes');
    expect(bagStock({ name: 'Burp cloth' } as never, stock)).toBeUndefined();
    expect((bagStock({ name: 'Diaper cream' } as never, stock) as { name: string } | undefined)?.name).toBe('Diaper cream');
    expect(bagStock({ name: 'Diaper rash spray' } as never, stock)).toBeUndefined();
    expect((bagStock({ name: 'Formula' } as never, stock) as { name: string } | undefined)?.name).toBe('Baby formula');
    expect((bagStock({ name: 'Anything', inventory: 'Rice' } as never, stock) as { name: string } | undefined)?.name).toBe('Rice');
  });
  it('uses one fixed "last checked" row per location', () => {
    expect(checkId('pantry')).toBe('pachkabcdefghij');
    expect(checkId('fridge')).toHaveLength(15);
    expect(checkId('fridge')).not.toBe(checkId('freezer'));
  });
});
