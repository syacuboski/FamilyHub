// Sample data for local development and end-to-end tests only.
// Mirrors the mockups (lemon chicken, daycare drop-off, diapers running low...).
// Dates are relative to today so the app always has something to show.

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const at = (d, h, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x.toISOString(); };
const q = (s) => JSON.stringify(String(s));

export async function seedSample(pb, H, users) {
  const [dad, mom] = users;
  const today = new Date();
  const already = await pb.collection('recipes').getList(1, 1, { filter: `household = ${q(H)}` });
  if (already.totalItems > 0) return; // sample data only once

  // ----- catalog -----
  const cat = {};
  const item = async (name, category, default_unit = '') => {
    const r = await pb.collection('items').create({ household: H, name, category, default_unit });
    cat[name] = r.id;
    return r.id;
  };
  for (const [n, c, u] of [
    ['Lemons', 'Produce', ''], ['Broccoli', 'Produce', 'head'], ['Garlic', 'Produce', 'clove'], ['Bananas', 'Produce', 'bunch'],
    ['Baby potatoes', 'Produce', 'lb'], ['Whole milk', 'Dairy', 'gal'], ['Greek yogurt', 'Dairy', 'tub'], ['Eggs', 'Dairy', 'eggs'],
    ['Coffee', 'Pantry', ''], ['Chicken thighs', 'Meat & seafood', 'lb'], ['Olive oil', 'Pantry', 'tbsp'], ['Dried oregano', 'Pantry', 'tsp'],
    ['Rice', 'Pantry', 'bags'], ['Pasta', 'Pantry', 'boxes'], ['Canned beans', 'Pantry', 'cans'], ['Diapers, size 3', 'Baby & kids', ''],
    ['Wipes', 'Baby & kids', 'packs'], ['Food pouches', 'Baby & kids', 'pouches'], ['Diaper cream', 'Baby & kids', 'tubes'],
    ['Frozen peas', 'Frozen', 'bags'],
  ]) await item(n, c, u);

  // ----- lists -----
  const grocery = await pb.collection('lists').getFirstListItem(`household = ${q(H)} && name = "Grocery"`);
  const costco = await pb.collection('lists').getFirstListItem(`household = ${q(H)} && name = "Costco"`);
  const li = (list, name, qty, unit, category, extra = {}) =>
    pb.collection('list_items').create({ household: H, list: list.id, item: cat[name] || '', name, qty, unit, category, checked: false, ...extra });
  await li(grocery, 'Lemons', 2, '', 'Produce', { source: 'Lemon chicken' });
  await li(grocery, 'Broccoli', 1, 'head', 'Produce', { source: 'Lemon chicken' });
  await li(grocery, 'Garlic', 1, '', 'Produce', { source: 'Lemon chicken' });
  await li(grocery, 'Bananas', 1, 'bunch', 'Produce');
  await li(grocery, 'Whole milk', 1, 'gal', 'Dairy');
  await li(grocery, 'Greek yogurt', 2, '', 'Dairy');
  await li(grocery, 'Diapers, size 3', 1, 'box', 'Baby & kids', { source: 'Running low' });
  await li(grocery, 'Wipes', 3, '', 'Baby & kids', { source: 'Running low' });
  await li(grocery, 'Eggs', 1, 'dz', 'Dairy', { checked: true, checked_by: dad.id, checked_at: new Date().toISOString(), check_order: 1 });
  await li(costco, 'Paper towels', 1, '', 'Household');
  await li(costco, 'Coffee', 2, '', 'Pantry');

  // ----- tasks -----
  const T = (title, due, extra = {}) => pb.collection('tasks').create({ household: H, title, due, done: false, remind: true, ...extra });
  await T('Restock the diaper bag', ymd(today), { assignee: mom.id, notes: 'Before daycare', source: 'Inventory' });
  await T('Trash & recycling to the curb', ymd(today), { assignee: dad.id, rrule: 'FREQ=WEEKLY' });
  await T('Laundry & fold', ymd(addDays(today, 2)), { assignee: mom.id, rrule: 'FREQ=WEEKLY' });
  await T('Sunday meal prep', ymd(addDays(today, 5)), { source: 'Menu' });
  await T('Change furnace filter', ymd(addDays(today, 18)), { assignee: dad.id, rrule: 'FREQ=MONTHLY;INTERVAL=3' });

  // ----- events -----
  const E = (title, start, end, extra = {}) => pb.collection('events').create({ household: H, title, start, end, all_day: false, reminder_min: -1, ...extra });
  await E('Daycare drop-off', at(addDays(today, -3), 9), at(addDays(today, -3), 9, 30), { owner: dad.id, rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' });
  await E('Pediatrician check-up', at(today, 15, 30), at(today, 16, 30), { owner: mom.id, reminder_min: 60 });
  await E('Family dinner', at(today, 18), at(today, 19));
  await E('Truck oil change', at(addDays(today, 1), 12), at(addDays(today, 1), 13), { owner: dad.id });
  await E('Book club', at(addDays(today, 1), 19), at(addDays(today, 1), 20), { owner: mom.id });
  await E('Dentist', at(addDays(today, 3), 15), at(addDays(today, 3), 16), { owner: mom.id, reminder_min: 60 });

  // ----- recipes -----
  const R = async (data, ings) => {
    const r = await pb.collection('recipes').create({ household: H, kid_portion: 0.5, weight_unit: 'g', ...data });
    for (const [i, [qty, unit, name, prep]] of ings.entries()) {
      await pb.collection('recipe_ingredients').create({ household: H, recipe: r.id, item: cat[name] || '', name, qty, unit, prep: prep || '', sort: i });
    }
    return r;
  };
  const lemon = await R({
    title: 'Sheet-pan lemon chicken & vegetables', servings: 4, prep_min: 15, cook_min: 30,
    tags: ['Dinner', 'Weeknight', 'Chicken'], protein: 34, carbs: 22, fat: 16, portion_weight: 340,
    reheat: '2 min in the microwave, covered',
    steps: [
      { text: 'Heat the oven to 425°F and line a sheet pan with parchment.' },
      { text: 'Toss the potatoes with 1 tbsp olive oil and a pinch of salt. Spread on the pan and roast.', timer_min: 15 },
      { text: 'Whisk the remaining oil with the garlic, lemon zest and juice, and oregano.' },
      { text: 'Toss the chicken thighs in the lemon mixture until coated.' },
      { text: 'Add the chicken and broccoli to the pan. Roast until the chicken reaches 165°F.', timer_min: 25 },
      { text: 'Rest 5 minutes, squeeze over any remaining lemon, and serve.', timer_min: 5 },
    ],
  }, [
    [2, 'lb', 'Chicken thighs', 'Patted dry'], [2, 'whole', 'Lemons', 'Zested, then juiced'], [1.5, 'lb', 'Baby potatoes', 'Halved'],
    [1, 'head', 'Broccoli', 'Cut into florets'], [3, 'tbsp', 'Olive oil', 'Split: 1 tbsp + the rest'], [4, 'clove', 'Garlic', 'Minced'],
    [1, 'tsp', 'Dried oregano', ''],
  ]);
  const chili = await R({ title: 'Turkey chili', servings: 6, prep_min: 15, cook_min: 45, tags: ['Dinner', 'Freezes well', 'Meal prep'],
    steps: [{ text: 'Brown the turkey with onion.' }, { text: 'Add beans and tomatoes; simmer.', timer_min: 30 }] },
    [[1, 'lb', 'Ground turkey'], [2, 'can', 'Canned beans'], [1, 'can', 'Crushed tomatoes'], [1, 'whole', 'Onion', 'Diced']]);
  const eggs = await R({ title: 'Eggs & toast', servings: 2, prep_min: 5, cook_min: 5, tags: ['Breakfast', 'Kid favorite'],
    steps: [{ text: 'Scramble the eggs; toast the bread.' }] }, [[4, 'whole', 'Eggs'], [4, 'slice', 'Bread']]);

  // ----- menu (this week) -----
  const M = (date, slot, data) => pb.collection('menu_entries').create({ household: H, date, slot, adults: 2, kids: 1, ...data });
  await M(ymd(today), 'breakfast', { recipe: eggs.id });
  await M(ymd(today), 'lunch', { text: 'Chicken & rice bowl', note: 'Meal prep' });
  await M(ymd(today), 'dinner', { recipe: lemon.id });
  await M(ymd(addDays(today, 1)), 'dinner', { recipe: chili.id });
  await M(ymd(addDays(today, 2)), 'dinner', { text: 'Leftovers', note: 'Turkey chili' });

  // ----- inventory -----
  const I = (name, location, qty, unit, low, par, extra = {}) =>
    pb.collection('inventory').create({ household: H, item: cat[name] || '', name, location, qty, unit, low, par, ...extra });
  await I('Rice', 'pantry', 2, 'bags', 1, 3);
  await I('Pasta', 'pantry', 3, 'boxes', 1, 4);
  await I('Olive oil', 'pantry', 1, 'bottle', 1, 2);
  await I('Canned beans', 'pantry', 6, 'cans', 2, 8);
  await I('Dried oregano', 'pantry', 1, 'jar', 0, 1);
  await I('Baby potatoes', 'pantry', 2, 'lb', 0, 2);
  await I('Whole milk', 'fridge', 1, 'gal', 1, 2, { expires_on: ymd(addDays(today, 4)) });
  await I('Eggs', 'fridge', 8, 'eggs', 4, 12, { expires_on: ymd(addDays(today, 13)) });
  await I('Greek yogurt', 'fridge', 2, 'tubs', 1, 3);
  await I('Lemons', 'fridge', 0, 'lemons', 1, 2);
  await I('Chicken thighs', 'freezer', 2, 'lb', 1, 4);
  await I('Frozen peas', 'freezer', 1, 'bags', 0, 2);
  await I('Diapers, size 3', 'kids', 6, 'left', 10, 40);
  await I('Wipes', 'kids', 1, 'packs', 2, 6);
  await I('Food pouches', 'kids', 12, 'pouches', 4, 16);
  await I('Diaper cream', 'kids', 2, 'tubes', 1, 3);
}
