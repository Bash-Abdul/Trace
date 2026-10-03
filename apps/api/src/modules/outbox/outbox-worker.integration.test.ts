import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createOutboxWorkerRepository, maxAttempts } from './outbox-worker.repository.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || !new URL(connectionString).pathname.endsWith('_test')) {
  throw new Error('Outbox tests require TEST_DATABASE_URL ending in _test');
}
// A unique schema isolates claiming and cleanup from every pre-existing job.
const schema = `outbox_test_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString });
const database = new pg.Pool({ connectionString, options: `-c search_path=${schema}` });
const repository = createOutboxWorkerRepository(database);

async function enqueue() {
  const result = await database.query<{ id: string }>(
    `INSERT INTO outbox_jobs
    (job_type, encrypted_payload, idempotency_key)
    VALUES ('SEND_EMAIL_VERIFICATION', 'test-payload', $1) RETURNING id`,
    [randomUUID()],
  );
  return result.rows[0]!.id;
}

beforeAll(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.query(`CREATE TABLE ${schema}.outbox_jobs (LIKE public.outbox_jobs INCLUDING ALL)`);
});
beforeEach(async () => {
  await database.query('DELETE FROM outbox_jobs');
});
afterAll(async () => {
  await database.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('outbox worker leases', () => {
  it('claims a job only once across simultaneous workers', async () => {
    const id = await enqueue();
    const results = await Promise.all([repository.claim('first'), repository.claim('second')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.find(Boolean)).toMatchObject({ id, attempt_count: 1 });
  });

  it('recovers an expired lease and fences the previous attempt even with the same worker ID', async () => {
    await enqueue();
    const oldJob = (await repository.claim('worker'))!;
    await database.query("UPDATE outbox_jobs SET lock_expires_at = now() - interval '1 second'");
    expect(await repository.settle(oldJob, 'worker', true)).toBe(false);
    const newJob = (await repository.claim('worker'))!;
    expect(newJob.attempt_count).toBe(2);
    expect(await repository.settle(oldJob, 'worker', true)).toBe(false);
    expect(await repository.settle(newJob, 'worker', true)).toBe(true);
    expect(await repository.claim('another')).toBeNull();
  });

  it('delays retries and stops after the attempt limit', async () => {
    await enqueue();
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const job = (await repository.claim('worker'))!;
      expect(job.attempt_count).toBe(attempt);
      expect(await repository.settle(job, 'worker', false)).toBe(true);
      expect(await repository.claim('worker')).toBeNull();
      await database.query("UPDATE outbox_jobs SET available_at = now() - interval '1 second'");
    }
    const result = await database.query<{
      status: string;
      failed_at: Date | null;
      locked_by: string | null;
    }>('SELECT status, failed_at, locked_by FROM outbox_jobs');
    expect(result.rows[0]).toMatchObject({ status: 'FAILED', locked_by: null });
    expect(result.rows[0]?.failed_at).toBeInstanceOf(Date);
  });

  it('marks a crash on the final attempt as failed after lease expiration', async () => {
    await enqueue();
    await database.query('UPDATE outbox_jobs SET attempt_count = $1', [maxAttempts - 1]);
    await repository.claim('crashed');
    await database.query("UPDATE outbox_jobs SET lock_expires_at = now() - interval '1 second'");
    expect(await repository.claim('replacement')).toBeNull();
    const result = await database.query<{ status: string }>('SELECT status FROM outbox_jobs');
    expect(result.rows[0]?.status).toBe('FAILED');
  });
});
