// Integration test for the push worker against a running dev PocketBase (:8090).
// A fake push service (local HTTPS server, throwaway self-signed cert) receives
// the encrypted notification.
// Run: npm run test:push   (needs `npm run pb` + seeded dev data, and openssl on PATH)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { createECDH, randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import PocketBase from '../../push-worker/node_modules/pocketbase/dist/pocketbase.es.mjs';

const PB_URL = 'http://127.0.0.1:8090';
const SU = { email: 'admin@familyhub.test', password: 'dev-admin-pass-123' };

function selfSigned() {
  const dir = mkdtempSync(join(tmpdir(), 'fh-push-'));
  const key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

function runWorker(env) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, ['push-worker/worker.mjs', '--once'], { env });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('exit', () => resolve(out));
  });
}

test('a task due now is pushed once to the assignee’s phone', async () => {
  const hits = [];
  const srv = createServer(selfSigned(), (req, res) => {
    let bytes = 0;
    req.on('data', (c) => (bytes += c.length));
    req.on('end', () => {
      hits.push({ encoding: req.headers['content-encoding'], vapid: String(req.headers.authorization || '').startsWith('vapid '), bytes });
      res.writeHead(201).end();
    });
  }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const port = srv.address().port;

  const pb = new PocketBase(PB_URL);
  await pb.collection('_superusers').authWithPassword(SU.email, SU.password);
  const dad = await pb.collection('users').getFirstListItem('email = "dad@familyhub.test"');

  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const sub = await pb.collection('push_subscriptions').create({
    user: dad.id, household: dad.household, endpoint: `https://127.0.0.1:${port}/push/${Date.now()}`,
    p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url'),
  });
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const task = await pb.collection('tasks').create({
    household: dad.household, title: 'Push test task', assignee: dad.id, remind: true, done: false,
    due: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, due_time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  });

  const keys = execFileSync(process.execPath, ['push-worker/worker.mjs', '--keys'], { encoding: 'utf8' });
  const env = {
    ...process.env, PB_URL, PB_SUPERUSER_EMAIL: SU.email, PB_SUPERUSER_PASSWORD: SU.password,
    VAPID_SUBJECT: 'https://familyhub.invalid', NODE_TLS_REJECT_UNAUTHORIZED: '0',
  };
  for (const line of keys.trim().split('\n')) {
    const i = line.indexOf('=');
    env[line.slice(0, i)] = line.slice(i + 1);
  }

  try {
    const first = await runWorker(env);
    assert.match(first, /sent [1-9]/, first);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].encoding, 'aes128gcm');
    assert.ok(hits[0].vapid, 'VAPID authorization header present');
    assert.ok(hits[0].bytes > 0, 'encrypted payload present');
    const second = await runWorker(env);
    assert.match(second, /sent 0/, second);
    assert.equal(hits.length, 1, 'never sent twice');
  } finally {
    await pb.collection('tasks').delete(task.id).catch(() => {});
    await pb.collection('push_subscriptions').delete(sub.id).catch(() => {});
    srv.close();
  }
});
