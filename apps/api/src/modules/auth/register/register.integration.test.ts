import 'dotenv/config';

import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { verifyPassword } from '../auth-crypto/auth-crypto.js';

function getTestDatabaseUrl(): string {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for registration integration tests');
  }

  const databaseUrl = new URL(testDatabaseUrl);
  const databaseName = databaseUrl.pathname.slice(1);

  // Never allow these tests to delete records from a non-test database.
  if (!databaseName.endsWith('_test')) {
    throw new Error('Registration integration tests require a database ending in "_test"');
  }

  return testDatabaseUrl;
}

/*
 * The registration service uses the application's main pool. Point that pool
 * at the guarded test database before dynamically importing the application.
 */
process.env.DATABASE_URL = getTestDatabaseUrl();

const { createApp } = await import('../../../app.js');
const { pool } = await import('../../../config/db.js');

const app = createApp();
const testEmailPrefix = 'registration-test-';

async function removeRegistrationTestUsers(): Promise<void> {
  // Deleting users also removes their action tokens through ON DELETE CASCADE.
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`${testEmailPrefix}%`]);
}

describe('POST /api/v1/auth/register', () => {
  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  beforeEach(async () => {
    await removeRegistrationTestUsers();
  });

  afterAll(async () => {
    await removeRegistrationTestUsers();
    await pool.end();
  });

  it('creates an unverified user and stores protected credentials and token data', async () => {
    const email = `${testEmailPrefix}${randomUUID()}@example.com`;
    const submittedEmail = `  ${email.toUpperCase()}  `;
    const password = 'CorrectHorseBattery1!';

    const response = await request(app).post('/api/v1/auth/register').send({
      email: submittedEmail,
      password,
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: 'If registration can be completed, check your email for verification instructions.',
    });

    const userResult = await pool.query<{
      id: string;
      email: string;
      password_hash: string;
      email_verified_at: Date | null;
    }>(
      `
        SELECT id, email, password_hash, email_verified_at
        FROM users
        WHERE email = $1
      `,
      [email],
    );

    const user = userResult.rows[0];

    expect(user).toBeDefined();
    expect(user?.email).toBe(email);
    expect(user?.password_hash).not.toBe(password);
    expect(await verifyPassword(user?.password_hash ?? '', password)).toBe(true);
    expect(user?.email_verified_at).toBeNull();

    const tokenResult = await pool.query<{
      purpose: string;
      token_hash: string;
      expires_at: Date;
      consumed_at: Date | null;
    }>(
      `
        SELECT purpose, token_hash, expires_at, consumed_at
        FROM auth_action_tokens
        WHERE user_id = $1
      `,
      [user?.id],
    );

    expect(tokenResult.rows).toHaveLength(1);
    expect(tokenResult.rows[0]).toMatchObject({
      purpose: 'EMAIL_VERIFICATION',
      consumed_at: null,
    });
    expect(tokenResult.rows[0]?.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenResult.rows[0]?.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns the same response without duplicating an existing account', async () => {
    const email = `${testEmailPrefix}${randomUUID()}@example.com`;
    const requestBody = {
      email,
      password: 'CorrectHorseBattery1!',
    };

    const firstResponse = await request(app).post('/api/v1/auth/register').send(requestBody);
    const secondResponse = await request(app).post('/api/v1/auth/register').send(requestBody);

    expect(firstResponse.status).toBe(202);
    expect(secondResponse.status).toBe(202);
    expect(secondResponse.body).toEqual(firstResponse.body);

    const countResult = await pool.query<{
      user_count: string;
      token_count: string;
    }>(
      `
        SELECT
          COUNT(DISTINCT users.id)::text AS user_count,
          COUNT(auth_action_tokens.id)::text AS token_count
        FROM users
        LEFT JOIN auth_action_tokens
          ON auth_action_tokens.user_id = users.id
        WHERE users.email = $1
      `,
      [email],
    );

    expect(countResult.rows[0]).toEqual({
      user_count: '1',
      token_count: '1',
    });
  });

  it('rejects invalid registration data without creating database records', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `${testEmailPrefix}invalid-email`,
        password: 'short',
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
      },
    });

    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM users WHERE email LIKE $1',
      [`${testEmailPrefix}%`],
    );

    expect(result.rows[0]?.count).toBe('0');
  });
});
