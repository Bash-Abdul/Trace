import type { MigrationBuilder } from 'node-pg-migrate';
export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE projects ADD COLUMN due_date date, ADD COLUMN timezone text,
      ADD CONSTRAINT project_deadline_timezone CHECK (due_date IS NULL OR timezone IS NOT NULL);
    ALTER TABLE project_milestones ADD COLUMN due_date date;
  `);
}
export function down(): void {
  throw new Error('Keep deadline history; use a forward migration to change the schema.');
}
