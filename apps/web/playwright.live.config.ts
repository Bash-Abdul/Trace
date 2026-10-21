import { defineConfig, devices } from '@playwright/test';
const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test'))
  throw new Error('Live browser tests require TEST_DATABASE_URL ending in _test.');
if (!process.env.OUTBOX_ENCRYPTION_KEY)
  throw new Error('Set a disposable OUTBOX_ENCRYPTION_KEY for the test API.');
export default defineConfig({
  testDir: './tests-live',
  outputDir: './test-results-live',
  workers: 1,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:5174', trace: 'off' },
  // Never attach live tests to a development API or an existing preview server.
  webServer: [
    {
      command: 'pnpm --filter @trace/api exec tsx src/server.ts',
      url: 'http://127.0.0.1:3100/ready',
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: database,
        APP_ORIGIN: 'http://127.0.0.1:5174',
        PORT: '3100',
        LOG_LEVEL: 'error',
      },
    },
    {
      command: 'pnpm dev --port 5174',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      env: { TRACE_API_TARGET: 'http://127.0.0.1:3100' },
    },
  ],
});
