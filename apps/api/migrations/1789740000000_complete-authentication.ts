import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('auth_audit_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    event: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('auth_audit_events', ['user_id', 'created_at']);
  pgm.createTable('auth_rate_limits', {
    key: { type: 'text', primaryKey: true },
    attempts: { type: 'integer', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
  });
  pgm.createIndex('auth_rate_limits', 'expires_at');
  pgm.dropConstraint('outbox_jobs', 'outbox_jobs_job_type_check');
  pgm.addConstraint('outbox_jobs', 'outbox_jobs_job_type_check', {
    check: "job_type IN ('SEND_EMAIL_VERIFICATION', 'SEND_PASSWORD_RESET')",
  });
}

export function down(pgm: MigrationBuilder): void {
  // Refuse rollback if password-reset jobs still exist rather than discard them.
  pgm.dropConstraint('outbox_jobs', 'outbox_jobs_job_type_check');
  pgm.addConstraint('outbox_jobs', 'outbox_jobs_job_type_check', {
    check: "job_type IN ('SEND_EMAIL_VERIFICATION')",
  });
  pgm.dropTable('auth_rate_limits');
  pgm.dropTable('auth_audit_events');
}
