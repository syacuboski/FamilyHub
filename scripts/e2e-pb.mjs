// Starts a throwaway PocketBase for end-to-end tests on :8091 with a fresh
// database, the dev superuser, two test users and sample data. Used by
// playwright.config.ts as a webServer; stops when Playwright stops it.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const exe = join(root, '.pb', process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
if (!existsSync(exe)) throw new Error(`PocketBase not found at ${exe}`);
const dir = join(tmpdir(), 'familyhub-e2e-pb');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const common = [`--dir=${dir}`, `--migrationsDir=${join(root, 'pb_migrations')}`];
execFileSync(exe, ['migrate', 'up', ...common], { stdio: 'inherit' });
execFileSync(exe, ['superuser', 'upsert', 'admin@familyhub.test', 'dev-admin-pass-123', `--dir=${dir}`], { stdio: 'inherit' });
const pb = spawn(exe, ['serve', '--http=127.0.0.1:8091', ...common, `--hooksDir=${join(root, 'pb_hooks')}`], { stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { pb.kill(); process.exit(0); });
pb.on('exit', (c) => process.exit(c ?? 0));

for (let i = 0; i < 50; i++) {
  try {
    const r = await fetch('http://127.0.0.1:8091/api/health');
    if (r.ok) break;
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 200));
}
execFileSync(process.execPath, [join(root, 'scripts', 'seed.mjs'), '--sample'], {
  stdio: 'inherit',
  env: { ...process.env, PB_URL: 'http://127.0.0.1:8091', FH_SEED_FILE: join(root, 'tests', 'e2e', 'seed.dev.json') },
});
// Signal readiness (after seeding) on :8092, which Playwright polls.
const { createServer } = await import('node:http');
createServer((_q, s) => s.end('ready')).listen(8092, '127.0.0.1');
console.log('E2E PocketBase ready');
