/// <reference path="../.pb/pb_data/types.d.ts" />
// Family Hub server hooks (PocketBase JSVM). Kept small on purpose: most logic
// lives in the app so it also works offline. These only normalise data.

// The shared item catalog matches names case-insensitively ("Milk" == "milk").
onRecordCreate((e) => {
  e.record.set('name_key', String(e.record.get('name') || '').trim().toLowerCase());
  e.next();
}, 'items');

onRecordUpdate((e) => {
  e.record.set('name_key', String(e.record.get('name') || '').trim().toLowerCase());
  e.next();
}, 'items');

// A tiny unauthenticated health route for deploy.sh and the SOP health check.
routerAdd('GET', '/api/fh/health', (e) => {
  return e.json(200, { ok: true, app: 'familyhub' });
});
