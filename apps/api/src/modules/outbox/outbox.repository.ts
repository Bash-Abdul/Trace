import type { PoolClient } from 'pg';

export type OutboxJobType = 'SEND_EMAIL_VERIFICATION';

interface CreateOutboxJobInput {
  jobType: OutboxJobType;
  encryptedPayload: string;
  idempotencyKey: string;
  availableAt?: Date;
}

/*
 * Adds a durable job using the caller's existing transaction.
 *
 * Returning null means the idempotency key already exists, so an identical
 * logical job was already scheduled.
 */
export async function createOutboxJob(
  client: PoolClient,
  input: CreateOutboxJobInput,
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO outbox_jobs (
        job_type,
        encrypted_payload,
        idempotency_key,
        available_at
      )
      VALUES ($1, $2, $3, COALESCE($4, now()))
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    `,
    [input.jobType, input.encryptedPayload, input.idempotencyKey, input.availableAt ?? null],
  );

  return result.rows[0]?.id ?? null;
}
