import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test'))
  throw new Error('Auth tests require a _test database');
process.env.DATABASE_URL = testUrl;
process.env.APP_ORIGIN = 'http://localhost:3000';
const { createApp } = await import('../../app.js');
const { pool } = await import('../../config/db.js');
const { decryptEmailVerificationPayload } = await import('../outbox/outbox-payload.js');
const { hashOpaqueToken } = await import('./auth-crypto/auth-crypto.js');
const { login: loginService, consumeAction } = await import('./auth.service.js');
const app = createApp();
const origin = 'http://localhost:3000';
const password = 'CorrectHorseBattery1!';
const newPassword = 'ChangedPassword123!';
const emails: string[] = [];
const jobs: string[] = [];
interface LoginBody {
  csrfToken: string;
  sessionId: string;
  user: { id: string; email: string };
}
function body(response: request.Response): LoginBody {
  return response.body as LoginBody;
}
function cookie(response: request.Response): string {
  const value = response.headers['set-cookie'] as unknown as string[];
  return value[0]!.split(';')[0]!;
}
async function tokenFor(
  email: string,
  purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' = 'EMAIL_VERIFICATION',
) {
  const result = await pool.query<{
    id: string;
    encrypted_payload: string;
    job_type: 'SEND_EMAIL_VERIFICATION' | 'SEND_PASSWORD_RESET';
  }>(
    `SELECT j.id, j.encrypted_payload, j.job_type FROM outbox_jobs j
    JOIN auth_action_tokens t ON j.idempotency_key LIKE '%:' || t.id::text
    JOIN users u ON u.id = t.user_id WHERE u.email = $1 AND t.purpose = $2
    AND t.invalidated_at IS NULL AND t.consumed_at IS NULL ORDER BY t.created_at DESC LIMIT 1`,
    [email, purpose],
  );
  const row = result.rows[0]!;
  jobs.push(row.id);
  return decryptEmailVerificationPayload(row.encrypted_payload, row.job_type).verificationToken;
}
async function register(verified = true) {
  const email = `auth-flow-${randomUUID()}@example.com`;
  emails.push(email);
  expect((await request(app).post('/api/v1/auth/register').send({ email, password })).status).toBe(
    202,
  );
  const token = await tokenFor(email);
  if (verified)
    expect((await request(app).post('/api/v1/auth/verify-email').send({ token })).status).toBe(204);
  return { email, token };
}
async function signIn(email: string, pass = password) {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password: pass });
  expect(response.status).toBe(200);
  return response;
}
async function resetToken(email: string) {
  expect(
    (await request(app).post('/api/v1/auth/password-reset/request').send({ email })).status,
  ).toBe(202);
  return tokenFor(email, 'PASSWORD_RESET');
}
beforeEach(async () => {
  await pool.query('DELETE FROM auth_rate_limits');
});
afterAll(async () => {
  // Only accounts created by this suite and their related outbox/audit records.
  await pool.query(
    `DELETE FROM outbox_jobs j USING auth_action_tokens t, users u
    WHERE j.idempotency_key LIKE '%:' || t.id::text AND t.user_id = u.id AND u.email = ANY($1::text[])`,
    [emails],
  );
  await pool.query('DELETE FROM outbox_jobs WHERE id = ANY($1::uuid[])', [jobs]);
  await pool.query(
    'DELETE FROM auth_audit_events WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))',
    [emails],
  );
  await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
  await pool.query('DELETE FROM auth_rate_limits');
  await pool.end();
});

describe('complete authentication lifecycle', () => {
  it('requires verification, consumes tokens once, and persists only session/CSRF hashes', async () => {
    const { email, token } = await register(false);
    expect((await request(app).post('/api/v1/auth/login').send({ email, password })).status).toBe(
      401,
    );
    expect((await request(app).post('/api/v1/auth/verify-email').send({ token })).status).toBe(204);
    expect((await request(app).post('/api/v1/auth/verify-email').send({ token })).status).toBe(400);
    const response = await signIn(email);
    expect(response.headers['set-cookie']?.toString()).toContain('HttpOnly');
    expect(response.headers['set-cookie']?.toString()).toContain('SameSite=Lax');
    expect(response.headers['cache-control']).toBe('no-store');
    const saved = await pool.query<{ token_hash: string; csrf_token_hash: string }>(
      'SELECT token_hash, csrf_token_hash FROM auth_sessions WHERE id = $1',
      [body(response).sessionId],
    );
    expect(saved.rows[0]?.token_hash).toBe(hashOpaqueToken(cookie(response).split('=')[1]!));
    expect(saved.rows[0]?.csrf_token_hash).toBe(hashOpaqueToken(body(response).csrfToken));
    const current = await request(app).get('/api/v1/auth/session').set('Cookie', cookie(response));
    expect(current.status).toBe(200);
    expect(body(current).csrfToken).toBe(body(response).csrfToken);
  });

  it('rejects expired verification tokens and resolves concurrent consumption once', async () => {
    const first = await register(false);
    await pool.query(
      "UPDATE auth_action_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
      [hashOpaqueToken(first.token)],
    );
    expect(
      (await request(app).post('/api/v1/auth/verify-email').send({ token: first.token })).status,
    ).toBe(400);
    const second = await register(false);
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app).post('/api/v1/auth/verify-email').send({ token: second.token }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([204, 400]);
  });

  it('resends after cooldown, invalidates the old token, and keeps unknown-email responses generic', async () => {
    const { email, token } = await register(false);
    await request(app).post('/api/v1/auth/resend-verification').send({ email });
    expect(await tokenFor(email)).toBe(token);
    await pool.query(
      "UPDATE auth_action_tokens SET created_at = now() - interval '2 minutes' WHERE token_hash = $1",
      [hashOpaqueToken(token)],
    );
    const known = await request(app).post('/api/v1/auth/resend-verification').send({ email });
    const unknown = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'absent@example.com' });
    expect(known.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
    const replacement = await tokenFor(email);
    expect(replacement).not.toBe(token);
    expect((await request(app).post('/api/v1/auth/verify-email').send({ token })).status).toBe(400);
    expect(
      (await request(app).post('/api/v1/auth/verify-email').send({ token: replacement })).status,
    ).toBe(204);
  });

  it('requires matching origin and session-bound CSRF before logout, then rejects the old cookie', async () => {
    const { email } = await register();
    const session = await signIn(email);
    const other = await signIn(email);
    const logout = () => request(app).post('/api/v1/auth/logout').set('Cookie', cookie(session));
    expect((await logout().set('Origin', origin)).status).toBe(403);
    expect((await logout().set('x-csrf-token', body(session).csrfToken)).status).toBe(403);
    expect(
      (
        await logout()
          .set('Origin', 'https://evil.example')
          .set('x-csrf-token', body(session).csrfToken)
      ).status,
    ).toBe(403);
    expect(
      (await logout().set('Origin', origin).set('x-csrf-token', body(other).csrfToken)).status,
    ).toBe(403);
    expect(
      (await logout().set('Origin', origin).set('x-csrf-token', body(session).csrfToken)).status,
    ).toBe(204);
    expect(
      (await request(app).get('/api/v1/auth/session').set('Cookie', cookie(session))).status,
    ).toBe(401);
    expect(
      (await request(app).get('/api/v1/auth/session').set('Cookie', cookie(other))).status,
    ).toBe(200);
  });

  it('lists only owned sessions, rejects cross-account revocation, and revokes individual/all sessions', async () => {
    const first = await register();
    const second = await register();
    const a = await signIn(first.email);
    const b = await signIn(first.email);
    const foreign = await signIn(second.email);
    const list = await request(app).get('/api/v1/auth/sessions').set('Cookie', cookie(a));
    const listed = list.body as { sessions: { id: string }[] };
    expect(listed.sessions.map((session) => session.id).sort()).toEqual(
      [body(a).sessionId, body(b).sessionId].sort(),
    );
    const revoke = (id: string) =>
      request(app)
        .delete(`/api/v1/auth/sessions/${id}`)
        .set('Cookie', cookie(a))
        .set('Origin', origin)
        .set('x-csrf-token', body(a).csrfToken);
    expect((await revoke(body(foreign).sessionId)).status).toBe(404);
    expect((await revoke(body(b).sessionId)).status).toBe(204);
    expect((await request(app).get('/api/v1/auth/session').set('Cookie', cookie(b))).status).toBe(
      401,
    );
    expect(
      (
        await request(app)
          .post('/api/v1/auth/sessions/revoke-all')
          .set('Cookie', cookie(a))
          .set('Origin', origin)
          .set('x-csrf-token', body(a).csrfToken)
      ).status,
    ).toBe(204);
    expect((await request(app).get('/api/v1/auth/session').set('Cookie', cookie(a))).status).toBe(
      401,
    );
    expect(
      (await request(app).get('/api/v1/auth/session').set('Cookie', cookie(foreign))).status,
    ).toBe(200);
  });

  it('resets the password atomically, revokes every session, and rejects token replay and the old password', async () => {
    const { email } = await register();
    const a = await signIn(email);
    const b = await signIn(email);
    const token = await resetToken(email);
    const unknown = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'absent@example.com' });
    expect(unknown.status).toBe(202);
    const confirm = () =>
      request(app)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token, password: newPassword });
    expect((await confirm()).status).toBe(204);
    expect((await confirm()).status).toBe(400);
    for (const session of [a, b])
      expect(
        (await request(app).get('/api/v1/auth/session').set('Cookie', cookie(session))).status,
      ).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email, password })).status).toBe(
      401,
    );
    await signIn(email, newPassword);
    const events = await pool.query<{ event: string }>(
      'SELECT event FROM auth_audit_events WHERE user_id = $1',
      [body(a).user.id],
    );
    expect(events.rows.map((row) => row.event)).toEqual(
      expect.arrayContaining([
        'REGISTERED',
        'EMAIL_VERIFIED',
        'LOGIN_SUCCEEDED',
        'PASSWORD_RESET',
        'ALL_SESSIONS_REVOKED',
      ]),
    );
  });

  it('rejects expired reset tokens and concurrent reset replay', async () => {
    const { email } = await register();
    const expired = await resetToken(email);
    await pool.query(
      "UPDATE auth_action_tokens SET expires_at = now() - interval '1 second', created_at = now() - interval '2 minutes' WHERE token_hash = $1",
      [hashOpaqueToken(expired)],
    );
    expect(
      (
        await request(app)
          .post('/api/v1/auth/password-reset/confirm')
          .send({ token: expired, password: newPassword })
      ).status,
    ).toBe(400);
    const token = await resetToken(email);
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post('/api/v1/auth/password-reset/confirm')
          .send({ token, password: newPassword }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([204, 400]);
  });

  it('does not let an old-password login survive a concurrent password reset', async () => {
    const { email } = await register();
    const token = await resetToken(email);
    const [loginResult] = await Promise.allSettled([
      loginService(email, password, null),
      consumeAction(token, 'PASSWORD_RESET', newPassword),
    ]);
    if (loginResult.status === 'fulfilled') {
      const result = await pool.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM auth_sessions WHERE id = $1',
        [loginResult.value.sessionId],
      );
      expect(result.rows[0]?.revoked_at).toBeInstanceOf(Date);
    }
    await signIn(email, newPassword);
  });

  it('enforces idle and absolute expiration and rotates an existing session on login', async () => {
    const { email } = await register();
    const initial = await signIn(email);
    const rotated = await request(app)
      .post('/api/v1/auth/login')
      .set('Cookie', cookie(initial))
      .send({ email, password });
    expect(rotated.status).toBe(200);
    expect(cookie(rotated)).not.toBe(cookie(initial));
    expect(
      (await request(app).get('/api/v1/auth/session').set('Cookie', cookie(initial))).status,
    ).toBe(401);
    await pool.query(
      "UPDATE auth_sessions SET idle_expires_at = now() - interval '1 second' WHERE id = $1",
      [body(rotated).sessionId],
    );
    expect(
      (await request(app).get('/api/v1/auth/session').set('Cookie', cookie(rotated))).status,
    ).toBe(401);
    const absolute = await signIn(email);
    await pool.query(
      "UPDATE auth_sessions SET idle_expires_at = now() - interval '2 seconds', absolute_expires_at = now() - interval '1 second' WHERE id = $1",
      [body(absolute).sessionId],
    );
    expect(
      (await request(app).get('/api/v1/auth/session').set('Cookie', cookie(absolute))).status,
    ).toBe(401);
  });

  it('keeps login failures generic and rejects tokens used for the wrong purpose', async () => {
    const { email, token } = await register(false);
    const unverified = await request(app).post('/api/v1/auth/login').send({ email, password });
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'WrongPassword123!' });
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'absent@example.com', password });
    for (const response of [unverified, wrong, unknown]) {
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }
    expect(
      (
        await request(app)
          .post('/api/v1/auth/password-reset/confirm')
          .send({ token, password: newPassword })
      ).status,
    ).toBe(400);
  });

  it('supersedes reset tokens and suppresses obsolete email jobs', async () => {
    const { email } = await register();
    const first = await resetToken(email);
    await pool.query(
      "UPDATE auth_action_tokens SET created_at = now() - interval '2 minutes' WHERE token_hash = $1",
      [hashOpaqueToken(first)],
    );
    const second = await resetToken(email);
    expect(second).not.toBe(first);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/password-reset/confirm')
          .send({ token: first, password: newPassword })
      ).status,
    ).toBe(400);
    const { createOutboxWorkerRepository } = await import('../outbox/outbox-worker.repository.js');
    const repository = createOutboxWorkerRepository(pool);
    const job = {
      id: randomUUID(),
      job_type: 'SEND_PASSWORD_RESET' as const,
      encrypted_payload: '',
      idempotency_key: '',
      attempt_count: 1,
    };
    expect(
      await repository.shouldSend(job, { recipientEmail: email, verificationToken: first }),
    ).toBe(false);
    expect(
      await repository.shouldSend(job, { recipientEmail: email, verificationToken: second }),
    ).toBe(true);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/password-reset/confirm')
          .send({ token: second, password: newPassword })
      ).status,
    ).toBe(204);
    expect(
      await repository.shouldSend(job, { recipientEmail: email, verificationToken: second }),
    ).toBe(false);
  });

  it('serializes concurrent verification resends into one replacement token and job', async () => {
    const { email, token } = await register(false);
    await pool.query(
      "UPDATE auth_action_tokens SET created_at = now() - interval '2 minutes' WHERE token_hash = $1",
      [hashOpaqueToken(token)],
    );
    const responses = await Promise.all(
      [1, 2].map(() => request(app).post('/api/v1/auth/resend-verification').send({ email })),
    );
    expect(responses.map((response) => response.status)).toEqual([202, 202]);
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text FROM auth_action_tokens t JOIN users u ON u.id = t.user_id
      WHERE u.email = $1 AND t.purpose = 'EMAIL_VERIFICATION' AND t.invalidated_at IS NULL AND t.consumed_at IS NULL`,
      [email],
    );
    expect(result.rows[0]?.count).toBe('1');
    expect(await tokenFor(email)).not.toBe(token);
  });

  it('refreshes idle expiry without extending the absolute lifetime', async () => {
    const { email } = await register();
    const session = await signIn(email);
    const before = await pool.query<{ absolute_expires_at: Date }>(
      'SELECT absolute_expires_at FROM auth_sessions WHERE id = $1',
      [body(session).sessionId],
    );
    await pool.query(
      "UPDATE auth_sessions SET idle_expires_at = now() + interval '60 seconds' WHERE id = $1",
      [body(session).sessionId],
    );
    expect(
      (await request(app).get('/api/v1/auth/session').set('Cookie', cookie(session))).status,
    ).toBe(200);
    const after = await pool.query<{ idle_expires_at: Date; absolute_expires_at: Date }>(
      'SELECT idle_expires_at, absolute_expires_at FROM auth_sessions WHERE id = $1',
      [body(session).sessionId],
    );
    expect(after.rows[0]!.idle_expires_at.getTime()).toBeGreaterThan(Date.now() + 120000);
    expect(after.rows[0]?.absolute_expires_at).toEqual(before.rows[0]?.absolute_expires_at);
  });

  it('throttles repeated account requests durably and rejects cross-origin login', async () => {
    const email = 'rate-limit@example.com';
    for (let i = 0; i < 10; i++)
      expect(
        (await request(app).post('/api/v1/auth/password-reset/request').send({ email })).status,
      ).toBe(202);
    const limited = await request(app).post('/api/v1/auth/password-reset/request').send({ email });
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('900');
    expect(
      (await request(app).post('/api/v1/auth/PASSWORD-RESET/REQUEST/').send({ email })).status,
    ).toBe(429);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .set('Origin', 'https://evil.example')
          .send({ email, password })
      ).status,
    ).toBe(403);
  });
});
