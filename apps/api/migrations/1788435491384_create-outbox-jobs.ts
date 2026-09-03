import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  /*
   * Stores durable jobs that must happen after an application transaction.
   * PostgreSQL is the MVP queue; a scheduled runner will process these rows.
   */
  pgm.createTable('outbox_jobs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },

    job_type: {
      type: 'text',
      notNull: true,
      check: "job_type IN ('SEND_EMAIL_VERIFICATION')",
    },

    /*
     * The next batch will encrypt the email payload before storing it.
     * Raw verification tokens must never be stored here as plain text.
     */
    encrypted_payload: {
      type: 'text',
      notNull: true,
    },

    /*
     * Prevents the same logical email job from being scheduled twice.
     */
    idempotency_key: {
      type: 'text',
      notNull: true,
      unique: true,
    },

    status: {
      type: 'text',
      notNull: true,
      default: 'PENDING',
      check: "status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')",
    },

    /*
     * Incremented whenever a worker claims the job for an attempt.
     */
    attempt_count: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'attempt_count >= 0',
    },

    /*
     * Allows immediate jobs and delayed retries to use the same query.
     */
    available_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },

    /*
     * A temporary worker lease prevents two workers processing one job.
     * An expired lease allows recovery if a worker crashes.
     */
    locked_by: {
      type: 'text',
    },

    lock_expires_at: {
      type: 'timestamptz',
    },

    /*
     * Must contain only a safe, bounded summary—never tokens or full links.
     */
    last_error: {
      type: 'text',
    },

    completed_at: {
      type: 'timestamptz',
    },

    failed_at: {
      type: 'timestamptz',
    },

    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },

    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  /*
   * Processing jobs must have a complete lease. Jobs in every other state
   * must not appear to be owned by a worker.
   */
  pgm.addConstraint('outbox_jobs', 'outbox_jobs_processing_lease_check', {
    check: `
        (
          status = 'PROCESSING'
          AND locked_by IS NOT NULL
          AND lock_expires_at IS NOT NULL
        )
        OR
        (
          status <> 'PROCESSING'
          AND locked_by IS NULL
          AND lock_expires_at IS NULL
        )
      `,
  });

  /*
   * Completion and permanent failure timestamps must match the job status.
   */
  pgm.addConstraint('outbox_jobs', 'outbox_jobs_terminal_state_check', {
    check: `
        (
          status = 'COMPLETED'
          AND completed_at IS NOT NULL
          AND failed_at IS NULL
        )
        OR
        (
          status = 'FAILED'
          AND failed_at IS NOT NULL
          AND completed_at IS NULL
        )
        OR
        (
          status IN ('PENDING', 'PROCESSING')
          AND completed_at IS NULL
          AND failed_at IS NULL
        )
      `,
  });

  /*
   * Supports finding pending jobs in the order they become available.
   */
  pgm.createIndex('outbox_jobs', ['available_at', 'created_at'], {
    name: 'outbox_jobs_pending_available_index',
    where: "status = 'PENDING'",
  });

  /*
   * Supports recovering jobs whose worker stopped before finishing.
   */
  pgm.createIndex('outbox_jobs', 'lock_expires_at', {
    name: 'outbox_jobs_expired_lease_index',
    where: "status = 'PROCESSING'",
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('outbox_jobs');
}
