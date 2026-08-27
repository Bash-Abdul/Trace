import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTransactionRunner } from './db.js';
import { env } from './index.js';

const { Pool } = pg;

function getTestDatabaseUrl(): string {
  if (!env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is required for integration tests');
  }

  const databaseUrl = new URL(env.TEST_DATABASE_URL);
  const databaseName = databaseUrl.pathname.slice(1);

  // Prevent a configuration mistake from running tests against development data.
  if (!databaseName.endsWith('_test')) {
    throw new Error('Integration tests require a database ending in "_test"');
  }

  return env.TEST_DATABASE_URL;
}

const testPool = new Pool({
  connectionString: getTestDatabaseUrl(),
});

const withTestTransaction = createTransactionRunner(testPool);

describe('PostgreSQL integration', () => {
  beforeAll(async () => {
    await testPool.query('SELECT 1');
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('has the authentication tables created by migrations', async () => {
    const result = await testPool.query<{
      users: string | null;
      sessions: string | null;
      tokens: string | null;
    }>(`
      SELECT
        to_regclass('public.users')::text AS users,
        to_regclass('public.auth_sessions')::text AS sessions,
        to_regclass('public.auth_action_tokens')::text AS tokens
    `);

    expect(result.rows[0]).toEqual({
      users: 'users',
      sessions: 'auth_sessions',
      tokens: 'auth_action_tokens',
    });
  });

  it('commits a successful transaction', async () => {
    const email = `transaction-commit-${randomUUID()}@example.com`;

    try {
      await withTestTransaction(async (client) => {
        await client.query(
          `
            INSERT INTO users (email, password_hash)
            VALUES ($1, $2)
          `,
          [email, 'integration-test-password-hash'],
        );
      });

      const result = await testPool.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM users
            WHERE email = $1
          ) AS exists
        `,
        [email],
      );

      expect(result.rows[0]?.exists).toBe(true);
    } finally {
      // Keep the shared test database clean if the assertion fails.
      await testPool.query('DELETE FROM users WHERE email = $1', [email]);
    }
  });

  it('rolls back a failed transaction', async () => {
    const email = `transaction-rollback-${randomUUID()}@example.com`;

    await expect(
      withTestTransaction(async (client) => {
        await client.query(
          `
            INSERT INTO users (email, password_hash)
            VALUES ($1, $2)
          `,
          [email, 'integration-test-password-hash'],
        );

        // Simulates a later operation failing inside the transaction.
        throw new Error('Simulated transaction failure');
      }),
    ).rejects.toThrow('Simulated transaction failure');

    const result = await testPool.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM users
          WHERE email = $1
        ) AS exists
      `,
      [email],
    );

    expect(result.rows[0]?.exists).toBe(false);
  });
});
