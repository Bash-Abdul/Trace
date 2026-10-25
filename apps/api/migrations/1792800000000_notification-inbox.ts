import type { MigrationBuilder } from 'node-pg-migrate';
export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE project_notifications ALTER COLUMN milestone_id DROP NOT NULL;
    ALTER TABLE project_notifications ADD COLUMN read_at timestamptz;
    ALTER TABLE project_notifications ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;
    CREATE INDEX project_notifications_unread ON project_notifications(recipient_id)
      WHERE read_at IS NULL;
  `);
}
export function down(pgm: MigrationBuilder): void {
  // Proposal notifications cannot fit the old non-null milestone contract.
  pgm.sql(`
    DELETE FROM project_notifications WHERE milestone_id IS NULL;
    DROP INDEX project_notifications_unread;
    ALTER TABLE project_notifications DROP COLUMN read_at, DROP COLUMN details;
    ALTER TABLE project_notifications ALTER COLUMN milestone_id SET NOT NULL;
  `);
}
