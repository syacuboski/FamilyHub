/// <reference path="../.pb/pb_data/types.d.ts" />
// Family Hub: initial schema. Every household-scoped collection carries a
// `household` relation, and the API rules below make each record visible only
// to signed-in members of that household.

migrate((app) => {
  // ---------- rules ----------
  const SAME = '@request.auth.id != "" && household = @request.auth.household';
  const CREATE = '@request.auth.id != "" && @request.body.household = @request.auth.household';
  const UPDATE =
    SAME + ' && (@request.body.household:isset = false || @request.body.household = @request.auth.household)';
  const scoped = { listRule: SAME, viewRule: SAME, createRule: CREATE, updateRule: UPDATE, deleteRule: SAME };

  // ---------- households ----------
  const households = new Collection({
    type: 'base',
    name: 'households',
    // members may read and rename their own household; only a superuser creates one
    listRule: '@request.auth.id != "" && id = @request.auth.household',
    viewRule: '@request.auth.id != "" && id = @request.auth.household',
    createRule: null,
    updateRule: '@request.auth.id != "" && id = @request.auth.household',
    deleteRule: null,
    fields: [
      { type: 'text', name: 'name', required: true, max: 80 },
      { type: 'text', name: 'timezone', max: 64 },
      { type: 'autodate', name: 'created', onCreate: true },
      { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
    ],
  });
  app.save(households);

  // ---------- users (built-in auth collection) ----------
  const users = app.findCollectionByNameOrId('users');
  users.fields.add(new RelationField({ name: 'household', collectionId: households.id, maxSelect: 1, cascadeDelete: false }));
  users.fields.add(new TextField({ name: 'color', max: 9 }));
  users.fields.add(new SelectField({ name: 'role', values: ['admin', 'adult', 'kid'], maxSelect: 1 }));
  users.fields.add(new JSONField({ name: 'prefs' }));
  users.listRule = '@request.auth.id != "" && household = @request.auth.household';
  users.viewRule = '@request.auth.id != "" && (id = @request.auth.id || household = @request.auth.household)';
  users.createRule = null; // accounts are created by the seed script (superuser)
  users.updateRule = 'id = @request.auth.id && @request.body.household:isset = false && @request.body.role:isset = false';
  users.deleteRule = null;
  // Stay signed in for 30 days between app opens (each open refreshes it).
  users.authToken.duration = 30 * 24 * 60 * 60;
  app.save(users);

  const hh = () => ({ type: 'relation', name: 'household', required: true, collectionId: households.id, maxSelect: 1, cascadeDelete: true });
  const stamps = () => [
    { type: 'autodate', name: 'created', onCreate: true },
    { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
  ];
  const base = (name, fields, indexes, extra) => {
    const c = new Collection(Object.assign({ type: 'base', name, fields: [hh()].concat(fields, stamps()), indexes: indexes || [] }, scoped, extra || {}));
    app.save(c);
    return c;
  };

  // ---------- shared item catalog ----------
  const items = base('items', [
    { type: 'text', name: 'name', required: true, max: 120 },
    { type: 'text', name: 'name_key', max: 120 },
    { type: 'text', name: 'default_unit', max: 24 },
    { type: 'text', name: 'category', max: 40 },
  ], ['CREATE INDEX idx_items_key ON items (household, name_key)']);

  // ---------- lists ----------
  const lists = base('lists', [
    { type: 'text', name: 'name', required: true, max: 60 },
    { type: 'select', name: 'kind', values: ['store', 'errands', 'wish', 'other'], maxSelect: 1 },
    { type: 'number', name: 'sort' },
    { type: 'text', name: 'color', max: 9 },
    { type: 'bool', name: 'shared' },
  ]);

  base('list_items', [
    { type: 'relation', name: 'list', required: true, collectionId: lists.id, maxSelect: 1, cascadeDelete: true },
    { type: 'relation', name: 'item', collectionId: items.id, maxSelect: 1, cascadeDelete: false },
    { type: 'text', name: 'name', required: true, max: 120 },
    { type: 'number', name: 'qty' },
    { type: 'text', name: 'unit', max: 24 },
    { type: 'text', name: 'category', max: 40 },
    { type: 'bool', name: 'checked' },
    { type: 'relation', name: 'checked_by', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
    { type: 'date', name: 'checked_at' },
    { type: 'number', name: 'check_order' },
    { type: 'text', name: 'source', max: 80 },
  ], ['CREATE INDEX idx_list_items_list ON list_items (list)']);

  base('stores', [
    { type: 'text', name: 'name', required: true, max: 80 },
    { type: 'json', name: 'category_order' },
    { type: 'number', name: 'sort' },
  ]);

  // ---------- tasks ----------
  base('tasks', [
    { type: 'text', name: 'title', required: true, max: 200 },
    { type: 'text', name: 'notes', max: 2000 },
    { type: 'text', name: 'due', max: 10 }, // YYYY-MM-DD (local date), empty = someday
    { type: 'text', name: 'due_time', max: 5 }, // HH:MM, optional
    { type: 'text', name: 'rrule', max: 300 },
    { type: 'relation', name: 'assignee', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
    { type: 'bool', name: 'done' },
    { type: 'date', name: 'done_at' },
    { type: 'text', name: 'last_done', max: 10 },
    { type: 'bool', name: 'remind' },
    { type: 'text', name: 'source', max: 80 },
  ], ['CREATE INDEX idx_tasks_due ON tasks (household, due)']);

  // ---------- calendar ----------
  base('events', [
    { type: 'text', name: 'title', required: true, max: 200 },
    { type: 'date', name: 'start', required: true },
    { type: 'date', name: 'end' },
    { type: 'bool', name: 'all_day' },
    { type: 'text', name: 'rrule', max: 300 },
    { type: 'json', name: 'exdates' },
    { type: 'relation', name: 'owner', collectionId: users.id, maxSelect: 1, cascadeDelete: false }, // empty = Family
    { type: 'number', name: 'reminder_min' }, // minutes before start; empty or <0 = none
    { type: 'text', name: 'location', max: 200 },
    { type: 'text', name: 'notes', max: 2000 },
    { type: 'text', name: 'external_id', max: 300 },
  ], ['CREATE INDEX idx_events_start ON events (household, start)']);

  // ---------- recipes ----------
  const recipes = base('recipes', [
    { type: 'text', name: 'title', required: true, max: 160 },
    { type: 'number', name: 'servings', min: 0 },
    { type: 'number', name: 'prep_min', min: 0 },
    { type: 'number', name: 'cook_min', min: 0 },
    { type: 'json', name: 'steps' }, // [{ text, timer_min? }]
    { type: 'json', name: 'tags' }, // ["Dinner", ...]
    { type: 'file', name: 'photo', maxSelect: 1, maxSize: 8 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'], thumbs: ['400x300', '120x120'] },
    { type: 'number', name: 'kid_portion', min: 0, max: 1 },
    { type: 'number', name: 'portion_weight', min: 0 },
    { type: 'text', name: 'weight_unit', max: 4 },
    { type: 'number', name: 'protein', min: 0 },
    { type: 'number', name: 'carbs', min: 0 },
    { type: 'number', name: 'fat', min: 0 },
    { type: 'text', name: 'reheat', max: 200 },
    { type: 'text', name: 'notes', max: 4000 },
    { type: 'text', name: 'source_url', max: 500 },
  ]);

  base('recipe_ingredients', [
    { type: 'relation', name: 'recipe', required: true, collectionId: recipes.id, maxSelect: 1, cascadeDelete: true },
    { type: 'relation', name: 'item', collectionId: items.id, maxSelect: 1, cascadeDelete: false },
    { type: 'text', name: 'name', required: true, max: 120 },
    { type: 'number', name: 'qty' },
    { type: 'text', name: 'unit', max: 24 },
    { type: 'text', name: 'prep', max: 120 },
    { type: 'number', name: 'sort' },
  ], ['CREATE INDEX idx_ri_recipe ON recipe_ingredients (recipe)']);

  base('tags', [
    { type: 'text', name: 'name', required: true, max: 40 },
    { type: 'text', name: 'group', max: 20 }, // meal | type | goodfor | yours
    { type: 'bool', name: 'show' },
    { type: 'number', name: 'sort' },
  ]);

  // ---------- menu ----------
  base('menu_entries', [
    { type: 'text', name: 'date', required: true, max: 10 }, // YYYY-MM-DD
    { type: 'select', name: 'slot', required: true, values: ['breakfast', 'lunch', 'dinner'], maxSelect: 1 },
    { type: 'relation', name: 'recipe', collectionId: recipes.id, maxSelect: 1, cascadeDelete: false },
    { type: 'text', name: 'text', max: 160 }, // free text when no recipe (Leftovers, Eating out...)
    { type: 'text', name: 'note', max: 200 },
    { type: 'bool', name: 'is_prep' },
    { type: 'number', name: 'adults', min: 0 },
    { type: 'number', name: 'kids', min: 0 },
    { type: 'number', name: 'prep_adult', min: 0 },
    { type: 'number', name: 'prep_kid', min: 0 },
  ], ['CREATE INDEX idx_menu_date ON menu_entries (household, date)']);

  // ---------- inventory ----------
  const inventory = base('inventory', [
    { type: 'relation', name: 'item', collectionId: items.id, maxSelect: 1, cascadeDelete: false },
    { type: 'text', name: 'name', required: true, max: 120 },
    { type: 'select', name: 'location', required: true, values: ['pantry', 'fridge', 'freezer', 'kids'], maxSelect: 1 },
    { type: 'number', name: 'qty', min: 0 },
    { type: 'text', name: 'unit', max: 24 },
    { type: 'number', name: 'low', min: 0 },
    { type: 'number', name: 'par', min: 0 },
    { type: 'text', name: 'expires_on', max: 10 },
    { type: 'text', name: 'note', max: 120 },
  ], ['CREATE INDEX idx_inv_loc ON inventory (household, location)']);

  base('inv_checks', [
    { type: 'text', name: 'location', required: true, max: 20 },
    { type: 'date', name: 'checked_at' },
  ], ['CREATE UNIQUE INDEX idx_inv_checks ON inv_checks (household, location)']);

  base('bag_items', [
    { type: 'text', name: 'name', required: true, max: 80 },
    { type: 'number', name: 'target_qty', min: 0 },
    { type: 'relation', name: 'inventory', collectionId: inventory.id, maxSelect: 1, cascadeDelete: false },
    { type: 'bool', name: 'packed' },
    { type: 'number', name: 'sort' },
  ]);

  // ---------- push ----------
  const OWN = '@request.auth.id != "" && user = @request.auth.id';
  const subs = new Collection({
    type: 'base',
    name: 'push_subscriptions',
    listRule: OWN,
    viewRule: OWN,
    createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id && @request.body.household = @request.auth.household',
    updateRule: OWN,
    deleteRule: OWN,
    fields: [
      { type: 'relation', name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      hh(),
      { type: 'text', name: 'endpoint', required: true, max: 1000 },
      { type: 'text', name: 'p256dh', max: 200 },
      { type: 'text', name: 'auth', max: 100 },
      { type: 'text', name: 'ua', max: 200 },
    ].concat(stamps()),
    indexes: ['CREATE UNIQUE INDEX idx_push_endpoint ON push_subscriptions (endpoint)'],
  });
  app.save(subs);

  // Written only by the push worker (superuser): one row per reminder sent.
  const log = new Collection({
    type: 'base',
    name: 'reminder_log',
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [{ type: 'text', name: 'key', required: true, max: 200 }].concat(stamps()),
    indexes: ['CREATE UNIQUE INDEX idx_reminder_key ON reminder_log (key)'],
  });
  app.save(log);
}, (app) => {
  const names = ['reminder_log', 'push_subscriptions', 'bag_items', 'inv_checks', 'inventory', 'menu_entries', 'tags',
    'recipe_ingredients', 'recipes', 'events', 'tasks', 'stores', 'list_items', 'lists', 'items'];
  for (const n of names) {
    try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {}
  }
  const users = app.findCollectionByNameOrId('users');
  for (const f of ['household', 'color', 'role', 'prefs']) users.fields.removeByName(f);
  app.save(users);
  try { app.delete(app.findCollectionByNameOrId('households')); } catch (_) {}
});
