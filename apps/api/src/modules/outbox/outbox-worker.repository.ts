import type { Pool } from 'pg';
import { hashOpaqueToken } from '../auth/auth-crypto/auth-crypto.js';
import type { EmailVerificationJobPayload } from './outbox-payload.js';

export interface ClaimedJob {
  id: string;
  job_type: 'SEND_EMAIL_VERIFICATION' | 'SEND_PASSWORD_RESET';
  encrypted_payload: string;
  idempotency_key: string;
  attempt_count: number;
}

export const maxAttempts = 5;

export function createOutboxWorkerRepository(database: Pool) {
  return {
    async shouldSend(job: ClaimedJob, payload: EmailVerificationJobPayload): Promise<boolean> {
      const purpose =
        job.job_type === 'SEND_PASSWORD_RESET' ? 'PASSWORD_RESET' : 'EMAIL_VERIFICATION';
      const result = await database.query(
        `SELECT t.id FROM auth_action_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1 AND t.purpose = $2 AND u.email = $3
          AND t.consumed_at IS NULL AND t.invalidated_at IS NULL AND t.expires_at > clock_timestamp()
          AND ($2 = 'PASSWORD_RESET' OR u.email_verified_at IS NULL)`,
        [hashOpaqueToken(payload.verificationToken), purpose, payload.recipientEmail],
      );
      return result.rowCount === 1;
    },
    async claim(workerId: string): Promise<ClaimedJob | null> {
      // Exhausted leases represent workers that crashed on their final attempt.
      await database.query(`
        UPDATE outbox_jobs SET status = 'FAILED', failed_at = now(),
          locked_by = NULL, lock_expires_at = NULL, updated_at = now(),
          last_error = 'Delivery attempts exhausted'
        WHERE status = 'PROCESSING' AND lock_expires_at <= now()
          AND attempt_count >= ${maxAttempts}
      `);
      // One atomic statement: concurrent workers skip each other's locked rows.
      const result = await database.query<ClaimedJob>(
        `WITH candidate AS (
          SELECT id FROM outbox_jobs
          WHERE job_type IN ('SEND_EMAIL_VERIFICATION', 'SEND_PASSWORD_RESET') AND attempt_count < $2
            AND ((status = 'PENDING' AND available_at <= now())
              OR (status = 'PROCESSING' AND lock_expires_at <= now()))
          ORDER BY available_at, created_at, id
          FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE outbox_jobs AS job SET status = 'PROCESSING',
          locked_by = $1, lock_expires_at = now() + interval '60 seconds',
          attempt_count = attempt_count + 1, updated_at = now()
        FROM candidate WHERE job.id = candidate.id
        RETURNING job.id, job.job_type, encrypted_payload, idempotency_key, attempt_count`,
        [workerId, maxAttempts],
      );
      return result.rows[0] ?? null;
    },
    async settle(job: ClaimedJob, workerId: string, succeeded: boolean): Promise<boolean> {
      const exhausted = job.attempt_count >= maxAttempts;
      const status = succeeded ? 'COMPLETED' : exhausted ? 'FAILED' : 'PENDING';
      const retrySeconds = Math.min(30 * 2 ** (job.attempt_count - 1), 900);
      const result = await database.query(
        `UPDATE outbox_jobs SET status = $4,
          completed_at = CASE WHEN $4 = 'COMPLETED' THEN now() ELSE NULL END,
          failed_at = CASE WHEN $4 = 'FAILED' THEN now() ELSE NULL END,
          available_at = CASE WHEN $4 = 'PENDING'
            THEN now() + $5 * interval '1 second' ELSE available_at END,
          last_error = $6, locked_by = NULL, lock_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND locked_by = $2 AND attempt_count = $3
          AND status = 'PROCESSING' AND lock_expires_at > now()`,
        [
          job.id,
          workerId,
          job.attempt_count,
          status,
          retrySeconds,
          succeeded ? null : 'Verification email delivery failed',
        ],
      );
      return result.rowCount === 1;
    },
  };
}
