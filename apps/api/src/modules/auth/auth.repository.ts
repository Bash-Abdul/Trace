import type { PoolClient } from 'pg';
import type { Database } from '../../config/db.js';
import type { Session, SessionIdentity } from './auth.types.js';

export async function lockSessionAccount(client: PoolClient, tokenHash: string): Promise<boolean> {
  const lookup = await client.query<{ user_id: string }>(
    'SELECT user_id FROM auth_sessions WHERE token_hash=$1',
    [tokenHash],
  );
  const owner = lookup.rows[0];
  if (!owner) return false;
  const locked = await client.query<{ id: string }>('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
    owner.user_id,
  ]);
  return locked.rowCount === 1;
}
export async function findActiveSessionForUpdate(
  client: PoolClient,
  tokenHash: string,
): Promise<Session | null> {
  const result = await client.query<Session>(
    `SELECT id,user_id,csrf_token_hash,created_at,idle_expires_at,absolute_expires_at
    FROM auth_sessions WHERE token_hash=$1 AND revoked_at IS NULL
    AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp() FOR UPDATE`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}
export async function touchSession(
  client: PoolClient,
  sessionId: string,
  idleSeconds: number,
): Promise<void> {
  await client.query(
    `UPDATE auth_sessions SET last_used_at=clock_timestamp(),
    idle_expires_at=LEAST(absolute_expires_at,clock_timestamp()+$2*interval '1 second') WHERE id=$1`,
    [sessionId, idleSeconds],
  );
}
// A single statement checks expiry/revocation and slides idle expiry. No request-long
// transaction or account lock is needed for a read that was authenticated at this point.
export async function readAndTouchSession(
  database: Database,
  tokenHash: string,
  idleSeconds: number,
): Promise<SessionIdentity | null> {
  const result = await database.query<SessionIdentity>(
    `UPDATE auth_sessions SET last_used_at=clock_timestamp(),
    idle_expires_at=LEAST(absolute_expires_at,clock_timestamp()+$2*interval '1 second')
    WHERE token_hash=$1 AND revoked_at IS NULL AND idle_expires_at>clock_timestamp()
      AND absolute_expires_at>clock_timestamp() RETURNING id,user_id`,
    [tokenHash, idleSeconds],
  );
  return result.rows[0] ?? null;
}
