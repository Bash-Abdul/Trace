import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Optional Linux/WSL native PostgreSQL setup. Owns only this repo's .local/postgres.
// Never stops, resets, or changes another PostgreSQL instance.
const connection = new URL(process.env.DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(connection.hostname) || connection.port !== '55433') {
  throw new Error('dev:db requires DATABASE_URL pointing to 127.0.0.1:55433.');
}
const user = decodeURIComponent(connection.username);
const password = decodeURIComponent(connection.password);
const database = decodeURIComponent(connection.pathname.slice(1));
if (!user || !password || !database || /[\r\n]/.test(password))
  throw new Error('Local database credentials are required.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const local = join(root, '.local');
const data = join(local, 'postgres');
mkdirSync(local, { recursive: true, mode: 0o700 });
chmodSync(local, 0o700);
const bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
function run(tool: string, args: string[], env = process.env) {
  return execFileSync(join(bin, tool), args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
}
if (!existsSync(join(data, 'PG_VERSION'))) {
  const temporary = mkdtempSync(join(tmpdir(), 'trace-pg-init-'));
  const passwordFile = join(temporary, 'password');
  try {
    writeFileSync(passwordFile, password, { mode: 0o600 });
    run('initdb', [
      '-D',
      data,
      '-U',
      user,
      '--auth=scram-sha-256',
      `--pwfile=${passwordFile}`,
      '--encoding=UTF8',
      '--no-locale',
    ]);
  } finally {
    // Remove only the temporary password file/directory created by this invocation.
    rmSync(passwordFile, { force: true });
    rmdirSync(temporary);
  }
}
let running = false;
try {
  run('pg_ctl', ['-D', data, 'status']);
  running = true;
} catch {
  /* This owned cluster is stopped. */
}
if (!running)
  run('pg_ctl', [
    '-D',
    data,
    '-l',
    join(local, 'postgres.log'),
    '-o',
    `-h 127.0.0.1 -p 55433 -k ${local}`,
    'start',
  ]);
const env = {
  ...process.env,
  PGHOST: '127.0.0.1',
  PGPORT: '55433',
  PGUSER: user,
  PGPASSWORD: password,
};
const names = [database];
if (process.env.TEST_DATABASE_URL) {
  const test = new URL(process.env.TEST_DATABASE_URL);
  const name = decodeURIComponent(test.pathname.slice(1));
  if (
    test.hostname === connection.hostname &&
    test.port === connection.port &&
    name.endsWith('_test')
  )
    names.push(name);
}
for (const name of names) {
  const databases = run('psql', ['-d', 'postgres', '-Atc', 'SELECT datname FROM pg_database'], env)
    .trim()
    .split('\n');
  if (!databases.includes(name)) run('createdb', ['--', name], env);
}
console.log(
  'Trace local PostgreSQL is ready at 127.0.0.1:55433. Existing databases were preserved.',
);
