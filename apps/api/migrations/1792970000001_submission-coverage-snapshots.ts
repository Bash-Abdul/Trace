import type { MigrationBuilder } from 'node-pg-migrate';
export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE milestone_submission_coverage (
      submission_id uuid PRIMARY KEY REFERENCES milestone_submission_versions(id) ON DELETE CASCADE,
      plan jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object')
    );
    CREATE FUNCTION preserve_submission_coverage() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'Submitted coverage is immutable' USING ERRCODE = '23514';
    END $$;
    CREATE TRIGGER preserve_submission_coverage BEFORE UPDATE ON milestone_submission_coverage
      FOR EACH ROW EXECUTE FUNCTION preserve_submission_coverage();
  `);
}
export function down(): void {
  throw new Error('Submission coverage history must be retained; use a forward migration.');
}
