import { describe, expect, it } from 'vitest';
import { caloriesFrom, fmtQty, parseQty, portionsFor, scaleFactor } from '../../src/lib/scale';
import { describeRule, expand, nextDue, occursOn } from '../../src/lib/recurrence';
import { parseEventText, parseIngredientLine, parseListItem } from '../../src/lib/parse';
import { additionsFor, needsFor } from '../../src/lib/missing';
import { fmtDue, parseYmd, ymd, addDays, today, startOfWeek } from '../../src/lib/dates';
import { guessCategory } from '../../src/lib/categories';
import type { InventoryRec, ListItem, RecipeIngredient } from '../../src/lib/types';

describe('portion scaler', () => {
  it('formats quarters like the mockup', () => {
    expect(fmtQty(2.5)).toBe('2½');
    expect(fmtQty(1.25)).toBe('1¼');
    expect(fmtQty(0.75)).toBe('¾');
    expect(fmtQty(3)).toBe('3');
    expect(fmtQty(12.4)).toBe('12½');
    expect(fmtQty(25.3)).toBe('25');
    expect(fmtQty(0.1)).toBe('⅛');
  });
  it('counts kid portions as a fraction of an adult', () => {
    const p = portionsFor({ adults: 2, kids: 1, prepAdult: 4, prepKid: 0 }, 0.5);
    expect(p.tonight).toBe(2.5);
    expect(p.prep).toBe(4);
    expect(p.total).toBe(6.5);
    expect(p.containers).toBe(4);
  });
  it('scales by written servings', () => {
    expect(scaleFactor(6.5, 4)).toBeCloseTo(1.625);
    expect(scaleFactor(3, 0)).toBe(1);
    // mockup: 2 lb chicken for 4 → 2½ portions = 1¼ lb
    expect(fmtQty(2 * scaleFactor(2.5, 4))).toBe('1¼');
  });
  it('calculates calories from macros', () => {
    expect(caloriesFrom(34, 22, 16)).toBe(368);
  });
  it('parses quantities', () => {
    expect(parseQty('1 1/2')).toBe(1.5);
    expect(parseQty('1½')).toBe(1.5);
    expect(parseQty('3/4')).toBe(0.75);
    expect(parseQty('2.25')).toBe(2.25);
    expect(parseQty('2-3')).toBe(3);
    expect(parseQty('abc')).toBeNaN();
  });
});

describe('recurrence', () => {
  it('expands a weekday event inside a week, keeping wall-clock time', () => {
    const start = new Date(2026, 9, 26, 9, 0); // Mon Oct 26 2026 9:00
    const ev = { start, end: new Date(2026, 9, 26, 9, 30), rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' };
    const occ = expand([ev], new Date(2026, 9, 25), new Date(2026, 10, 1));
    expect(occ.map((o) => o.key)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
    expect(occ.every((o) => o.start.getHours() === 9 && o.start.getMinutes() === 0)).toBe(true);
  });
  it('keeps 9:00 across the DST change', () => {
    const ev = { start: new Date(2026, 9, 26, 9, 0), end: new Date(2026, 9, 26, 9, 30), rrule: 'FREQ=WEEKLY' };
    const occ = expand([ev], new Date(2026, 10, 7), new Date(2026, 10, 14)); // after Nov 1 DST end
    expect(occ).toHaveLength(1);
    expect(occ[0].start.getHours()).toBe(9);
  });
  it('skips excluded dates', () => {
    const ev = { start: new Date(2026, 9, 26, 9), end: new Date(2026, 9, 26, 10), rrule: 'FREQ=DAILY', exdates: ['2026-10-27'] };
    const occ = expand([ev], new Date(2026, 9, 26), new Date(2026, 9, 29));
    expect(occ.map((o) => o.key)).toEqual(['2026-10-26', '2026-10-28']);
  });
  it('includes one-off events that overlap the range', () => {
    const ev = { start: new Date(2026, 9, 27, 15, 30), end: new Date(2026, 9, 27, 16, 30) };
    expect(expand([ev], new Date(2026, 9, 27), new Date(2026, 9, 28))).toHaveLength(1);
    expect(expand([ev], new Date(2026, 9, 28), new Date(2026, 9, 29))).toHaveLength(0);
  });
  it('advances a weekly chore to the next slot after today', () => {
    // due Tue Oct 27; finished that day → Tue Nov 3
    expect(nextDue('2026-10-27', 'FREQ=WEEKLY', new Date(2026, 9, 27, 20))).toBe('2026-11-03');
    // finished late on Thu Oct 29 → still next Tue Nov 3
    expect(nextDue('2026-10-27', 'FREQ=WEEKLY', new Date(2026, 9, 29, 8))).toBe('2026-11-03');
    // every 3 months
    expect(nextDue('2026-11-15', 'FREQ=MONTHLY;INTERVAL=3', new Date(2026, 10, 15, 10))).toBe('2027-02-15');
  });
  it('knows which days a chore lands on', () => {
    expect(occursOn('2026-10-27', 'FREQ=WEEKLY', new Date(2026, 10, 3))).toBe(true);
    expect(occursOn('2026-10-27', 'FREQ=WEEKLY', new Date(2026, 10, 4))).toBe(false);
    expect(occursOn('2026-10-27', '', new Date(2026, 9, 27))).toBe(true);
  });
  it('describes rules in plain words', () => {
    expect(describeRule('FREQ=WEEKLY', new Date(2026, 9, 27))).toBe('Every Tuesday');
    expect(describeRule('FREQ=MONTHLY;INTERVAL=3')).toBe('Every 3 months');
    expect(describeRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('Repeats weekdays');
  });
});

describe('quick add parsing', () => {
  it('reads list items', () => {
    expect(parseListItem('Milk 2 gal')).toMatchObject({ name: 'Milk', qty: 2, unit: 'gallon', category: 'Dairy' });
    expect(parseListItem('2 gal milk')).toMatchObject({ name: 'Milk', qty: 2, unit: 'gallon' });
    expect(parseListItem('lemons x3')).toMatchObject({ name: 'Lemons', qty: 3, unit: '', category: 'Produce' });
    expect(parseListItem('3 lemons')).toMatchObject({ name: 'Lemons', qty: 3 });
    expect(parseListItem('coffee')).toMatchObject({ name: 'Coffee', qty: 1 });
    expect(parseListItem('Diapers size 3')).toMatchObject({ name: 'Diapers size', qty: 3 });
  });
  it('reads events', () => {
    const now = new Date(2026, 9, 27, 10); // Tue
    const a = parseEventText('Dentist Fri 3pm', now);
    expect(a.title).toBe('Dentist');
    expect(a.date && ymd(a.date)).toBe('2026-10-30');
    expect(a.time).toBe('15:00');
    const b = parseEventText('Book club tomorrow at 7', now);
    expect(b.title).toBe('Book club');
    expect(b.date && ymd(b.date)).toBe('2026-10-28');
    expect(b.time).toBe('19:00');
    const c = parseEventText('Haircut 11/20 10:30am', now);
    expect(c.date && ymd(c.date)).toBe('2026-11-20');
    expect(c.time).toBe('10:30');
    const d = parseEventText('Flu shots Nov 3', now);
    expect(d.title).toBe('Flu shots');
    expect(d.date && ymd(d.date)).toBe('2026-11-03');
    expect(parseEventText('Call plumber', now)).toEqual({ title: 'Call plumber', date: null, time: null });
  });
  it('reads pasted ingredient lines', () => {
    expect(parseIngredientLine('2 lb beef chuck, cubed')).toEqual({ qty: 2, unit: 'lb', name: 'Beef chuck', prep: 'cubed' });
    expect(parseIngredientLine('1 1/2 cups beef broth')).toEqual({ qty: 1.5, unit: 'cup', name: 'Beef broth', prep: '' });
    expect(parseIngredientLine('4 carrots')).toEqual({ qty: 4, unit: 'whole', name: 'Carrots', prep: '' });
    expect(parseIngredientLine('- 2 fl oz cream')).toEqual({ qty: 2, unit: 'fl oz', name: 'Cream', prep: '' });
    expect(parseIngredientLine('Salt to taste')).toEqual({ qty: null, unit: 'to taste', name: 'Salt', prep: '' });
    expect(parseIngredientLine('3 cloves of garlic, minced')).toEqual({ qty: 3, unit: 'clove', name: 'Garlic', prep: 'minced' });
    expect(parseIngredientLine('   ')).toBeNull();
  });
  it('guesses categories', () => {
    expect(guessCategory('Chicken thighs')).toBe('Meat & seafood');
    expect(guessCategory('Wipes')).toBe('Baby & kids');
    expect(guessCategory('Mystery thing')).toBe('Other');
  });
});

describe('missing ingredients', () => {
  const ing = (name: string, qty: number, unit: string, item = ''): RecipeIngredient =>
    ({ id: name, household: 'h', recipe: 'r', name, qty, unit, item, sort: 0 });
  const inv = (name: string, qty: number, item = ''): InventoryRec =>
    ({ id: name, household: 'h', name, qty, item, location: 'pantry', unit: '', low: 0, par: 0 });
  it('marks stock and builds additions without duplicates', () => {
    const needs = needsFor(
      [ing('Chicken thighs', 2, 'lb'), ing('Lemons', 2, 'whole'), ing('Broccoli', 1, 'head'), ing('Salt', 0, 'to taste'), ing('Garlic', 4, 'clove')],
      2.5 / 4,
      [inv('Chicken thigh', 2), inv('Lemons', 0)],
    );
    expect(needs.map((n) => [n.name, n.inStock])).toEqual([
      ['Chicken thighs', true], ['Lemons', false], ['Broccoli', false], ['Salt', true], ['Garlic', false],
    ]);
    const onList = [{ id: 'x', household: 'h', list: 'l', name: 'broccoli', qty: 1, unit: '', category: '', checked: false } as ListItem];
    const adds = additionsFor(needs, onList);
    expect(adds.map((a) => [a.name, a.qty, a.unit])).toEqual([['Lemons', 2, ''], ['Garlic', 1, '']]);
  });
});

describe('dates', () => {
  it('round-trips YYYY-MM-DD and labels due dates', () => {
    expect(ymd(parseYmd('2026-03-08'))).toBe('2026-03-08');
    expect(fmtDue(ymd(today()))).toBe('Today');
    expect(fmtDue(ymd(addDays(today(), 1)))).toBe('Tomorrow');
    expect(fmtDue(ymd(addDays(today(), -3)))).toBe('3 days overdue');
    expect(fmtDue('')).toBe('Someday');
  });
  it('starts weeks on Sunday or Monday', () => {
    const wed = new Date(2026, 9, 28);
    expect(ymd(startOfWeek(wed, 0))).toBe('2026-10-25');
    expect(ymd(startOfWeek(wed, 1))).toBe('2026-10-26');
  });
});
