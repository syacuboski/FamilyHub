#!/usr/bin/env node
// Export recipes (with ingredients and photos) to a JSON file, or import them.
// Handy for keeping recipes typed into a test database, and for moving them
// onto the real server.
//
//   node scripts/recipes-io.mjs export [file] [--title "Pumpkin"]
//   node scripts/recipes-io.mjs import <file> [--household "Our family"]
//
// Signs in as a PocketBase superuser: PB_URL, PB_SUPERUSER_EMAIL and
// PB_SUPERUSER_PASSWORD from the environment, or asked for (password hidden).
// Import skips recipes whose title already exists in that household.
import PocketBase from 'pocketbase';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import readline from 'node:readline';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest.splice(i, 2)[1] : undefined;
};
const titleFilter = flag('--title');
const householdName = flag('--household');
const file = rest[0];

function ask(q, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => rl.output.write(s.includes(q) ? s : s.replace(/[^\r\n]/g, '*'));
    rl.question(q + ' ', (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); });
  });
}

const pb = new PocketBase(process.env.PB_URL || 'http://127.0.0.1:8090');
pb.autoCancellation(false);
const email = process.env.PB_SUPERUSER_EMAIL || (await ask('PocketBase superuser email:'));
const password = process.env.PB_SUPERUSER_PASSWORD || (await ask('Superuser password:', true));
await pb.collection('_superusers').authWithPassword(email, password);
const q = (s) => JSON.stringify(String(s));

if (cmd === 'export') {
  const filter = titleFilter ? `title ~ ${q(titleFilter)}` : '';
  const recipes = await pb.collection('recipes').getFullList({ filter, sort: 'title' });
  const out = [];
  for (const r of recipes) {
    const ings = await pb.collection('recipe_ingredients').getFullList({ filter: `recipe = ${q(r.id)}`, sort: 'sort' });
    let photo = null;
    if (r.photo) {
      const res = await fetch(pb.files.getURL(r, r.photo), { headers: { Authorization: pb.authStore.token } });
      if (res.ok) photo = { name: r.photo, type: res.headers.get('content-type'), base64: Buffer.from(await res.arrayBuffer()).toString('base64') };
    }
    const keep = ({ id, household, created, updated, collectionId, collectionName, photo: _p, expand, ...data }) => data;
    out.push({ recipe: keep(r), ingredients: ings.map(({ id, household, recipe, item, created, updated, collectionId, collectionName, ...d }) => d), photo });
  }
  const path = file || `.pb/exports/recipes-${new Date().toISOString().slice(0, 10)}.json`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ version: 1, exported: new Date().toISOString(), recipes: out }, null, 2));
  console.log(`Exported ${out.length} recipe(s) to ${path}:`);
  for (const o of out) console.log(`  · ${o.recipe.title} (${o.ingredients.length} ingredients${o.photo ? ', photo' : ''})`);
} else if (cmd === 'import' && file) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const houses = await pb.collection('households').getFullList();
  const house = householdName ? houses.find((h) => h.name === householdName) : houses.length === 1 ? houses[0] : null;
  if (!house) {
    console.error(`Pick a household with --household. Found: ${houses.map((h) => h.name).join(', ')}`);
    process.exit(1);
  }
  let added = 0;
  for (const { recipe, ingredients, photo } of data.recipes) {
    const exists = await pb.collection('recipes').getList(1, 1, { filter: `household = ${q(house.id)} && title = ${q(recipe.title)}` });
    if (exists.totalItems) { console.log(`  skip (already there): ${recipe.title}`); continue; }
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...recipe, household: house.id })) fd.append(k, typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? ''));
    if (photo) fd.append('photo', new Blob([Buffer.from(photo.base64, 'base64')], { type: photo.type || 'image/jpeg' }), photo.name);
    const r = await pb.collection('recipes').create(fd);
    for (const ing of ingredients) {
      // link to the shared item catalog, creating the item if needed
      const key = ing.name.trim().toLowerCase();
      let item = (await pb.collection('items').getList(1, 1, { filter: `household = ${q(house.id)} && name_key = ${q(key)}` })).items[0];
      if (!item) item = await pb.collection('items').create({ household: house.id, name: ing.name.trim(), category: '' });
      await pb.collection('recipe_ingredients').create({ ...ing, household: house.id, recipe: r.id, item: item.id });
    }
    console.log(`  added: ${recipe.title}`);
    added++;
  }
  console.log(`Imported ${added} recipe(s) into "${house.name}".`);
} else {
  console.log('Usage:\n  node scripts/recipes-io.mjs export [file] [--title "words"]\n  node scripts/recipes-io.mjs import <file> [--household "name"]');
  process.exit(1);
}
