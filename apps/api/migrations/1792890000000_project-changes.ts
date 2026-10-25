import type { MigrationBuilder } from 'node-pg-migrate';
export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE project_milestones ADD COLUMN archived_at timestamptz, ALTER COLUMN position DROP NOT NULL;
    ALTER TABLE project_deliverables ADD COLUMN archived_at timestamptz, ALTER COLUMN position DROP NOT NULL;
    ALTER TABLE project_milestones ADD CHECK ((archived_at IS NULL) = (position IS NOT NULL));
    ALTER TABLE project_deliverables ADD CHECK ((archived_at IS NULL) = (position IS NOT NULL));
    CREATE TABLE project_changes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      version integer NOT NULL DEFAULT 1,
      state text NOT NULL CHECK (state IN ('DRAFT','PROPOSED','APPROVED_AND_APPLIED','REJECTED','WITHDRAWN')),
      reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
      before_structure jsonb NOT NULL,
      after_structure jsonb NOT NULL,
      created_by uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      submitted_by uuid REFERENCES users(id),
      submitted_at timestamptz,
      decided_by uuid REFERENCES users(id),
      decided_at timestamptz,
      feedback text,
      CHECK ((state IN ('DRAFT','WITHDRAWN')) OR (submitted_by IS NOT NULL AND submitted_at IS NOT NULL)),
      CHECK ((state IN ('APPROVED_AND_APPLIED','REJECTED')) = (decided_by IS NOT NULL AND decided_at IS NOT NULL AND feedback IS NOT NULL))
    );
    CREATE UNIQUE INDEX project_one_open_change ON project_changes(project_id) WHERE state IN ('DRAFT','PROPOSED');
    CREATE INDEX project_changes_history ON project_changes(project_id, created_at DESC);
    CREATE FUNCTION preserve_project_change() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (NEW.id, NEW.project_id, NEW.created_by, NEW.created_at, NEW.before_structure)
        IS DISTINCT FROM (OLD.id, OLD.project_id, OLD.created_by, OLD.created_at, OLD.before_structure)
        OR (OLD.state <> 'DRAFT' AND (NEW.after_structure, NEW.reason, NEW.submitted_by, NEW.submitted_at)
          IS DISTINCT FROM (OLD.after_structure, OLD.reason, OLD.submitted_by, OLD.submitted_at))
        OR (OLD.state IN ('APPROVED_AND_APPLIED','REJECTED','WITHDRAWN') AND NEW IS DISTINCT FROM OLD) THEN
        RAISE EXCEPTION 'Submitted changes and completed decisions are immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER preserve_project_change BEFORE UPDATE ON project_changes
      FOR EACH ROW EXECUTE FUNCTION preserve_project_change();
  `);
}
export function down(): void {
  throw new Error(
    'Project-change history must be retained. Use a forward migration to revise this schema.',
  );
}
