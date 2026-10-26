import type { MigrationBuilder } from 'node-pg-migrate';
export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE project_membership_removals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id),
      role text NOT NULL CHECK (role = 'AUTHOR'),
      joined_at timestamptz NOT NULL,
      removed_at timestamptz NOT NULL DEFAULT now(),
      removed_by uuid NOT NULL REFERENCES users(id),
      reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000)
    );
    CREATE INDEX project_former_member ON project_membership_removals(project_id, user_id, removed_at DESC);
  `);
}
export function down(): void {
  throw new Error('Membership attribution must be retained. Use a forward corrective migration.');
}
