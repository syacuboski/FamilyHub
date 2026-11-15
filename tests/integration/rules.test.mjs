// Household isolation: members only ever see and change their own household's data.
// Run: npm run test:api  (needs `npm run pb` + seeded dev data)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import PocketBase from '../../push-worker/node_modules/pocketbase/dist/pocketbase.es.mjs';
test('API rules keep households apart', async () => {
const U='http://127.0.0.1:8090';
const su=new PocketBase(U); await su.collection('_superusers').authWithPassword('admin@familyhub.test','dev-admin-pass-123');
// second household + intruder
let other; try { other = await su.collection('households').getFirstListItem('name="Other"'); } catch { other = await su.collection('households').create({name:'Other'}); }
try { await su.collection('users').getFirstListItem('email="x@familyhub.test"'); } catch { await su.collection('users').create({email:'x@familyhub.test',password:'intruder-pass-1',passwordConfirm:'intruder-pass-1',name:'X',household:other.id,verified:true}); }
const dad=new PocketBase(U); await dad.collection('users').authWithPassword('dad@familyhub.test','dev-dad-pass-123');
const x=new PocketBase(U); await x.collection('users').authWithPassword('x@familyhub.test','intruder-pass-1');
const H=dad.authStore.record.household;
assert.ok((await dad.collection('list_items').getFullList()).length > 0);
assert.equal((await x.collection('list_items').getFullList()).length, 0);
assert.deepEqual((await x.collection('users').getFullList()).map(u=>u.name), ['X']);
const id='abcdefghij'+String(Date.now()).slice(-5);
const lists=await dad.collection('lists').getFullList();
const r=await dad.collection('list_items').create({id,household:H,list:lists[0].id,name:'Rule test'}); assert.equal(r.id, id);
try { await x.collection('list_items').create({household:H,list:lists[0].id,name:'evil'}); assert.fail('cross-household create allowed'); } catch(e){ assert.ok(e.status >= 400); }
try { await x.collection('list_items').update(id,{name:'evil'}); assert.fail('should be refused'); } catch(e){ assert.ok(e.status >= 400); }
try { await dad.collection('list_items').update(id,{household:other.id}); assert.fail('household move allowed'); } catch(e){ assert.ok(e.status >= 400); }
try { await dad.collection('users').update(dad.authStore.record.id,{household:other.id}); assert.fail('should be refused'); } catch(e){ assert.ok(e.status >= 400); }
await dad.collection('list_items').delete(id);
await su.collection('users').delete((await su.collection('users').getFirstListItem('email="x@familyhub.test"')).id);
await su.collection('households').delete(other.id);
});
