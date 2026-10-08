import { timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool, withTransaction } from '../../config/db.js';
import { env } from '../../config/index.js';
import { badRequest, forbidden, notFound, unauthorized } from '../../utils/app-error.js';
import { encryptEmailVerificationPayload } from '../outbox/outbox-payload.js';
import { createOutboxJob } from '../outbox/outbox.repository.js';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from './auth-crypto/auth-crypto.js';
import { sessionCsrfToken } from './auth-policy.js';

type Purpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
interface User {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: Date | null;
}
interface Session {
  id: string;
  user_id: string;
  csrf_token_hash: string;
  created_at: Date;
  idle_expires_at: Date;
  absolute_expires_at: Date;
}

export async function audit(
  client: PoolClient,
  event: string,
  userId: string | null,
): Promise<void> {
  await client.query('INSERT INTO auth_audit_events (event, user_id) VALUES ($1, $2)', [
    event,
    userId,
  ]);
}

export async function requestAction(email: string, purpose: Purpose): Promise<void> {
  const rawToken = generateOpaqueToken();
  await withTransaction(async (client) => {
    // All account mutations lock the user first, then tokens/sessions, to avoid
    // deadlocks and prevent password-reset/login races.
    const result = await client.query<User>(
      'SELECT * FROM users WHERE email = $1 FOR NO KEY UPDATE',
      [email],
    );
    const user = result.rows[0];
    await audit(
      client,
      purpose === 'PASSWORD_RESET' ? 'PASSWORD_RESET_REQUESTED' : 'VERIFICATION_REQUESTED',
      user?.id ?? null,
    );
    if (!user || (purpose === 'EMAIL_VERIFICATION' && user.email_verified_at)) return;
    const recent = await client.query(
      `SELECT id FROM auth_action_tokens WHERE user_id = $1
      AND purpose = $2 AND created_at > now() - interval '60 seconds' LIMIT 1`,
      [user.id, purpose],
    );
    if (recent.rowCount) return;
    await client.query(
      `UPDATE auth_action_tokens SET invalidated_at = now()
      WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL AND invalidated_at IS NULL`,
      [user.id, purpose],
    );
    const lifetime = purpose === 'PASSWORD_RESET' ? 1800 : 86400;
    const token = await client.query<{ id: string }>(
      `INSERT INTO auth_action_tokens
      (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, now() + $4 * interval '1 second') RETURNING id`,
      [user.id, purpose, hashOpaqueToken(rawToken), lifetime],
    );
    const jobType =
      purpose === 'PASSWORD_RESET' ? 'SEND_PASSWORD_RESET' : 'SEND_EMAIL_VERIFICATION';
    const jobId = await createOutboxJob(client, {
      jobType,
      encryptedPayload: encryptEmailVerificationPayload(
        { recipientEmail: email, verificationToken: rawToken },
        jobType,
      ),
      idempotencyKey: `${purpose.toLowerCase()}:${token.rows[0]!.id}`,
    });
    if (!jobId) throw new Error('Action email job could not be created');
  });
}

export async function consumeAction(
  rawToken: string,
  purpose: Purpose,
  password?: string,
): Promise<void> {
  // Expensive hashing happens outside the transaction.
  const passwordHash = password === undefined ? undefined : await hashPassword(password);
  await withTransaction(async (client) => {
    const lookup = await client.query<{ user_id: string }>(
      'SELECT user_id FROM auth_action_tokens WHERE token_hash = $1 AND purpose = $2',
      [hashOpaqueToken(rawToken), purpose],
    );
    const userId = lookup.rows[0]?.user_id;
    if (!userId) throw badRequest('Invalid or expired token', 'INVALID_TOKEN');
    await client.query('SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE', [userId]);
    const consumed = await client.query(
      `UPDATE auth_action_tokens SET consumed_at = clock_timestamp()
      WHERE token_hash = $1 AND purpose = $2 AND expires_at > clock_timestamp()
        AND consumed_at IS NULL AND invalidated_at IS NULL RETURNING id`,
      [hashOpaqueToken(rawToken), purpose],
    );
    if (!consumed.rowCount) throw badRequest('Invalid or expired token', 'INVALID_TOKEN');
    if (purpose === 'EMAIL_VERIFICATION') {
      await client.query(
        'UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1',
        [userId],
      );
      await audit(client, 'EMAIL_VERIFIED', userId);
    } else {
      if (!passwordHash) throw badRequest('Password required');
      await client.query(
        'UPDATE users SET password_hash = $2, password_changed_at = clock_timestamp(), updated_at = now() WHERE id = $1',
        [userId, passwordHash],
      );
      await client.query(
        'UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      );
      await audit(client, 'PASSWORD_RESET', userId);
      await audit(client, 'ALL_SESSIONS_REVOKED', userId);
    }
  });
}

// Unknown emails incur the same password-verification primitive as known ones.
const dummyHash = hashPassword(generateOpaqueToken());
export async function login(email: string, password: string, previousToken: string | null) {
  const lookup = await pool.query<User>('SELECT * FROM users WHERE email = $1', [email]);
  const candidate = lookup.rows[0];
  const valid = await verifyPassword(candidate?.password_hash ?? (await dummyHash), password);
  const rawToken = generateOpaqueToken();
  const csrfToken = sessionCsrfToken(rawToken);
  const result = await withTransaction(async (client) => {
    const locked = candidate
      ? await client.query<User>('SELECT * FROM users WHERE id = $1 FOR NO KEY UPDATE', [
          candidate.id,
        ])
      : null;
    const user = locked?.rows[0];
    if (!valid || !user?.email_verified_at || user.password_hash !== candidate?.password_hash) {
      await audit(client, 'LOGIN_FAILED', user?.id ?? null);
      return null;
    }
    if (previousToken) {
      const rotated = await client.query(
        'UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL',
        [hashOpaqueToken(previousToken), user.id],
      );
      if (rotated.rowCount) await audit(client, 'SESSION_ROTATED', user.id);
    }
    const session = await client.query<{ id: string }>(
      `INSERT INTO auth_sessions
      (user_id, token_hash, csrf_token_hash, idle_expires_at, absolute_expires_at)
      VALUES ($1, $2, $3, now() + $4 * interval '1 second', now() + $5 * interval '1 second') RETURNING id`,
      [
        user.id,
        hashOpaqueToken(rawToken),
        hashOpaqueToken(csrfToken),
        env.SESSION_IDLE_SECONDS,
        env.SESSION_ABSOLUTE_SECONDS,
      ],
    );
    await audit(client, 'LOGIN_SUCCEEDED', user.id);
    return { user: { id: user.id, email: user.email }, sessionId: session.rows[0]!.id };
  });
  if (!result) throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  return { ...result, rawToken, csrfToken };
}

// Keep the session check and protected operation in one account-locked transaction.
// NO KEY UPDATE still serializes account changes, while allowing foreign-key
// references from another member's concurrent project audit/notification writes.
export async function withSession<T>(
  rawToken: string | null,
  csrf: string | undefined,
  operation: (client: PoolClient, session: Session) => Promise<T>,
): Promise<T> {
  if (!rawToken) throw unauthorized();
  return withTransaction(async (client) => {
    const hash = hashOpaqueToken(rawToken);
    const lookup = await client.query<{ user_id: string }>(
      'SELECT user_id FROM auth_sessions WHERE token_hash = $1',
      [hash],
    );
    const userId = lookup.rows[0]?.user_id;
    if (!userId) throw unauthorized();
    await client.query('SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE', [userId]);
    const active = await client.query<Session>(
      `SELECT * FROM auth_sessions WHERE token_hash = $1
      AND revoked_at IS NULL AND idle_expires_at > clock_timestamp() AND absolute_expires_at > clock_timestamp() FOR UPDATE`,
      [hash],
    );
    const session = active.rows[0];
    if (!session) throw unauthorized();
    if (
      csrf !== undefined &&
      !timingSafeEqual(
        Buffer.from(hashOpaqueToken(csrf), 'hex'),
        Buffer.from(session.csrf_token_hash, 'hex'),
      )
    ) {
      throw forbidden('Invalid CSRF token', 'CSRF_INVALID');
    }
    await client.query(
      `UPDATE auth_sessions SET last_used_at = clock_timestamp(),
      idle_expires_at = LEAST(absolute_expires_at, clock_timestamp() + $2 * interval '1 second') WHERE id = $1`,
      [session.id, env.SESSION_IDLE_SECONDS],
    );
    return operation(client, session);
  });
}

export async function revokeSession(
  client: PoolClient,
  session: Session,
  target: string,
): Promise<void> {
  const result =
    target === 'all'
      ? await client.query(
          'UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
          [session.user_id],
        )
      : await client.query(
          'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1 AND id = $2',
          [session.user_id, target],
        );
  if (!result.rowCount) throw notFound('Session not found');
  await audit(
    client,
    target === 'all' ? 'ALL_SESSIONS_REVOKED' : 'SESSION_REVOKED',
    session.user_id,
  );
}
