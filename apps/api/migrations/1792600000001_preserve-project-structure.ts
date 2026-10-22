import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  // Allow a single transaction to swap positions while retaining record IDs.
  pgm.sql(`
    ALTER TABLE project_milestones DROP CONSTRAINT project_milestones_project_id_position_key,
      ADD CONSTRAINT project_milestones_project_id_position_key UNIQUE(project_id,position) DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE project_deliverables DROP CONSTRAINT project_deliverables_project_id_position_key,
      ADD CONSTRAINT project_deliverables_project_id_position_key UNIQUE(project_id,position) DEFERRABLE INITIALLY DEFERRED;
    CREATE INDEX project_invitation_history ON project_invitations(project_id,created_at DESC);
    CREATE FUNCTION preserve_project_identity() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (NEW.id,NEW.created_by_user_id,NEW.project_type,NEW.approval_route,NEW.template_key,NEW.template_version)
        IS DISTINCT FROM (OLD.id,OLD.created_by_user_id,OLD.project_type,OLD.approval_route,OLD.template_key,OLD.template_version) THEN
        RAISE EXCEPTION 'Project identity and approval provenance are immutable' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER preserve_project_identity BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION preserve_project_identity();
    CREATE FUNCTION preserve_proposal_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (NEW.id,NEW.project_id,NEW.version,NEW.structure,NEW.submitted_by_user_id,NEW.submitted_at)
        IS DISTINCT FROM (OLD.id,OLD.project_id,OLD.version,OLD.structure,OLD.submitted_by_user_id,OLD.submitted_at)
        OR (OLD.decision IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
        RAISE EXCEPTION 'Submitted proposals and completed decisions are immutable' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER preserve_proposal_snapshot BEFORE UPDATE ON project_proposals FOR EACH ROW EXECUTE FUNCTION preserve_proposal_snapshot();
    ALTER TABLE project_proposals ADD CONSTRAINT proposal_decision_complete CHECK (
      (decision IS NULL AND decided_by_user_id IS NULL AND decided_at IS NULL AND feedback IS NULL)
      OR (decision IS NOT NULL AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL AND feedback IS NOT NULL
        AND (decision='APPROVE' OR length(trim(feedback))>0)));
  `);
}
export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE project_proposals DROP CONSTRAINT proposal_decision_complete;
    DROP TRIGGER preserve_proposal_snapshot ON project_proposals;
    DROP FUNCTION preserve_proposal_snapshot();
    DROP TRIGGER preserve_project_identity ON projects;
    DROP FUNCTION preserve_project_identity();
    DROP INDEX project_invitation_history;
    ALTER TABLE project_milestones DROP CONSTRAINT project_milestones_project_id_position_key,
      ADD CONSTRAINT project_milestones_project_id_position_key UNIQUE(project_id,position);
    ALTER TABLE project_deliverables DROP CONSTRAINT project_deliverables_project_id_position_key,
      ADD CONSTRAINT project_deliverables_project_id_position_key UNIQUE(project_id,position);
  `);
}
