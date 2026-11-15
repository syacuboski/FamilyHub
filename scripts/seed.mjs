#!/usr/bin/env node
// Creates the household, the family's sign-in accounts and starter data.
//
// On the server (interactive; passwords are typed hidden and never stored):
//   node scripts/seed.mjs
//
// For local dev/tests (non-interactive), point at a JSON file:
//   FH_SEED_FILE=tests/e2e/seed.dev.json node scripts/seed.mjs --sample
//
// It signs in as a PocketBase *superuser* (the admin account from the SOP).
// Safe to re-run: existing users/lists/tags are kept, missing ones are added.
import PocketBase from 'pocketbase';
import { readFileSync } from 'node:fs';
import readline from 'node:readline';

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const withSample = process.argv.includes('--sample');
const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

// ---------- prompts ----------
function ask(question, { hidden = false, def = '' } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else rl.output.write(s.replace(/[^\r\n]/g, '*'));
      };
    }
    rl.question(question + (def ? ` [${def}]` : '') + ' ', (a) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(a.trim() || def);
    });
  });
}

async function askPassword(label) {
  for (;;) {
    const p1 = await ask(`  Password for ${label} (min 10 characters):`, { hidden: true });
    if (p1.length < 10) { console.log('  Too short, try again.'); continue; }
    const p2 = await ask('  Type it again:', { hidden: true });
    if (p1 !== p2) { console.log("  They didn't match, try again."); continue; }
    return p1;
  }
}

async function gatherConfig() {
  if (process.env.FH_SEED_FILE) return JSON.parse(readFileSync(process.env.FH_SEED_FILE, 'utf8'));
  console.log('\nFamily Hub setup\n================');
  console.log(`PocketBase: ${PB_URL}\n`);
  console.log('1) Sign in with the PocketBase superuser (admin) account.');
  // check the admin login right away, so a typo doesn't waste everything typed after it
  let suEmail = '';
  let suPassword = '';
  for (let tries = 1; ; tries++) {
    suEmail = await ask('  Superuser email:');
    suPassword = await ask('  Superuser password:', { hidden: true });
    try {
      await pb.collection('_superusers').authWithPassword(suEmail, suPassword);
      console.log('  ✓ Signed in');
      break;
    } catch (e) {
      if (e?.status === 0) {
        console.log(`\n  Can't reach PocketBase at ${PB_URL}. Is it running? (systemctl status pocketbase)`);
        process.exit(1);
      }
      console.log("  That admin email and password didn't work. Use the PocketBase admin login (the one for /_/).");
      if (tries >= 3) {
        console.log('\n  To set a new admin password, run (keep the leading space so it stays out of your history):');
        console.log("   cd /opt/pocketbase && ./pocketbase superuser upsert <email> '<new password>'\n");
        process.exit(1);
      }
    }
  }
  console.log('\n2) Household');
  const household = await ask('  Household name:', { def: 'Our family' });
  const n = Number(await ask('  How many grown-up accounts to create?', { def: '2' })) || 2;
  const palette = ['#D9B36C', '#9C8BD6', '#7FC4C9', '#E9A27C'];
  const users = [];
  for (let i = 0; i < n; i++) {
    console.log(`\n3.${i + 1}) Person ${i + 1}`);
    const name = await ask('  Name shown in the app (e.g. Dad, Mom, Spencer):');
    const email = await ask('  Email they sign in with:');
    const password = await askPassword(name || email);
    users.push({ name, email, password, color: palette[i % palette.length], role: i === 0 ? 'admin' : 'adult' });
  }
  return { superuser: { email: suEmail, password: suPassword }, household, users };
}

// ---------- helpers ----------
async function firstOrNull(col, filter) {
  try { return await pb.collection(col).getFirstListItem(filter); } catch { return null; }
}
const q = (s) => JSON.stringify(String(s));

async function ensure(col, filter, data) {
  const found = await firstOrNull(col, filter);
  if (found) return found;
  return pb.collection(col).create(data);
}

// ---------- main ----------
const cfg = await gatherConfig();
if (!pb.authStore.isValid) await pb.collection('_superusers').authWithPassword(cfg.superuser.email, cfg.superuser.password);

let house = await firstOrNull('households', `name = ${q(cfg.household)}`);
if (!house) house = await pb.collection('households').create({ name: cfg.household, timezone: 'America/New_York' });
const H = house.id;
console.log(`\n✓ Household "${house.name}" (${H})`);

const created = [];
for (const u of cfg.users) {
  const existing = await firstOrNull('users', `email = ${q(u.email)}`);
  if (existing) {
    await pb.collection('users').update(existing.id, { household: H, name: u.name, color: u.color });
    if (u.password) await pb.collection('users').update(existing.id, { password: u.password, passwordConfirm: u.password });
    console.log(`✓ Updated ${u.name} <${u.email}>`);
    created.push(existing);
  } else {
    const rec = await pb.collection('users').create({
      email: u.email, emailVisibility: true, password: u.password, passwordConfirm: u.password,
      name: u.name, color: u.color, role: u.role || 'adult', household: H, verified: true,
    });
    console.log(`✓ Created ${u.name} <${u.email}>`);
    created.push(rec);
  }
}

// Starter lists (the top one is the Quick add default)
const lists = [
  { name: 'Grocery', kind: 'store', color: '#D9B36C', sort: 0 },
  { name: 'Costco', kind: 'store', color: '#7FC4C9', sort: 1 },
  { name: 'Hardware', kind: 'errands', color: '#9C8BD6', sort: 2 },
];
for (const l of lists) await ensure('lists', `household = ${q(H)} && name = ${q(l.name)}`, { ...l, shared: true, household: H });
await ensure('stores', `household = ${q(H)} && name = "Grocery store"`, { name: 'Grocery store', household: H, sort: 0, category_order: [] });
console.log('✓ Lists');

// Recipe tag groups (from the Recipe entry mockup)
const tagDefs = [
  ['meal', ['Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack']],
  ['type', ['Pasta', 'Chicken', 'Beef', 'Pork', 'Seafood', 'Vegetarian', 'Soup', 'Cookies', 'Baking']],
  ['goodfor', ['Meal prep', 'Freezes well', 'Kid favorite', 'Weeknight', 'Holiday']],
];
const hidden = new Set(['Chicken', 'Beef', 'Pork', 'Seafood', 'Freezes well', 'Snack', 'Soup', 'Baking', 'Vegetarian', 'Weeknight', 'Holiday']);
let s = 0;
for (const [group, names] of tagDefs) {
  for (const name of names) {
    await ensure('tags', `household = ${q(H)} && name = ${q(name)}`, { name, group, show: !hidden.has(name), sort: s++, household: H });
  }
}
console.log('✓ Recipe tags');

// Diaper bag checklist (Inventory → Kids)
const bag = [['Diapers', 4], ['Wipes', 1], ['Change of clothes', 1], ['Burp cloth', 1], ['Snacks / pouches', 2], ['Diaper cream', 1], ['Water bottle', 1]];
for (const [i, [name, target]] of bag.entries()) {
  await ensure('bag_items', `household = ${q(H)} && name = ${q(name)}`, { name, target_qty: target, packed: false, sort: i, household: H });
}
console.log('✓ Diaper bag checklist');

if (withSample) {
  const { seedSample } = await import('./seed-sample.mjs');
  await seedSample(pb, H, created);
  console.log('✓ Sample data');
}

console.log('\nAll set. Each person can now sign in on their phone.\n');
