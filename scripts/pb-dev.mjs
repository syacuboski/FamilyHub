// Runs the local development PocketBase from ./.pb with this repo's
// migrations, hooks and (if built) the app in ./dist.
// Usage: npm run pb            (http://127.0.0.1:8090, admin at /_/)
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const exe = join(root, '.pb', process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
if (!existsSync(exe)) {
  console.error(`PocketBase not found at ${exe}. See README → Local development, step 2.`);
  process.exit(1);
}
const dataDir = process.env.PB_DATA_DIR || join(root, '.pb', 'pb_data');
const port = process.env.PB_PORT || '8090';
const args = [
  'serve',
  `--http=127.0.0.1:${port}`,
  `--dir=${dataDir}`,
  `--migrationsDir=${join(root, 'pb_migrations')}`,
  `--hooksDir=${join(root, 'pb_hooks')}`,
  `--publicDir=${join(root, 'dist')}`,
];
const child = spawn(exe, args, { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
