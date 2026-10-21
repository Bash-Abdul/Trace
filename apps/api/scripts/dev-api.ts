import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

// The local .env is authoritative for this development-only entry point.
// Production and isolated test entry points keep normal environment precedence.
const loaded = config({
  path: fileURLToPath(new URL('../.env', import.meta.url)),
  override: true,
  quiet: true,
});
if (loaded.error) throw new Error('Create apps/api/.env before starting the development API.');
if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') {
  throw new Error('dev:api is for NODE_ENV=development only.');
}
await import('../src/server.js');
