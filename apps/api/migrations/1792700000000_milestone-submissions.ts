import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE milestone_submissions (
      milestone_id uuid PRIMARY KEY REFERENCES project_milestones(id) ON DELETE CASCADE,
      version integer NOT NULL DEFAULT 0,
      state text NOT NULL DEFAULT 'NOT_STARTED'
        CHECK (state IN ('NOT_STARTED', 'DRAFT', 'AWAITING_REVIEW', 'REVISION_REQUESTED', 'APPROVED'))
    );
    CREATE TABLE milestone_draft_evidence (
      id uuid PRIMARY KEY,
      milestone_id uuid NOT NULL REFERENCES milestone_submissions(milestone_id) ON DELETE CASCADE,
      position integer NOT NULL,
      kind text NOT NULL CHECK (kind IN ('TEXT', 'LINK')),
      title text NOT NULL,
      content text NOT NULL,
      created_by uuid NOT NULL REFERENCES users(id),
      updated_by uuid NOT NULL REFERENCES users(id),
      UNIQUE (milestone_id, position) DEFERRABLE INITIALLY DEFERRED
    );
    CREATE TABLE milestone_submission_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      milestone_id uuid NOT NULL REFERENCES milestone_submissions(milestone_id) ON DELETE CASCADE,
      number integer NOT NULL,
      evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) > 0),
      submitted_by uuid NOT NULL REFERENCES users(id),
      submitted_at timestamptz NOT NULL DEFAULT now(),
      decision text CHECK (decision IN ('APPROVE', 'REQUEST_REVISION')),
      feedback text,
      decided_by uuid REFERENCES users(id),
      decided_at timestamptz,
      UNIQUE (milestone_id, number),
      CHECK (
        (decision IS NULL AND feedback IS NULL AND decided_by IS NULL AND decided_at IS NULL)
        OR (decision IS NOT NULL AND feedback IS NOT NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL
          AND (decision = 'APPROVE' OR length(trim(feedback)) > 0))
      )
    );
    CREATE UNIQUE INDEX milestone_one_pending_version ON milestone_submission_versions(milestone_id)
      WHERE decision IS NULL;
    CREATE FUNCTION preserve_milestone_submission() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (NEW.id, NEW.milestone_id, NEW.number, NEW.evidence, NEW.submitted_by, NEW.submitted_at)
        IS DISTINCT FROM (OLD.id, OLD.milestone_id, OLD.number, OLD.evidence, OLD.submitted_by, OLD.submitted_at)
        OR (OLD.decision IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
        RAISE EXCEPTION 'Submitted evidence and completed reviews are immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER preserve_milestone_submission BEFORE UPDATE ON milestone_submission_versions
      FOR EACH ROW EXECUTE FUNCTION preserve_milestone_submission();
    CREATE TABLE milestone_feedback (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_version_id uuid NOT NULL REFERENCES milestone_submission_versions(id) ON DELETE CASCADE,
      body text NOT NULL,
      blocking boolean NOT NULL,
      state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'ADDRESSED_BY_AUTHOR', 'RESOLVED_BY_REVIEWER')),
      version integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX milestone_feedback_subject ON milestone_feedback(submission_version_id);
    CREATE TABLE milestone_feedback_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      feedback_id uuid NOT NULL REFERENCES milestone_feedback(id) ON DELETE CASCADE,
      author_id uuid NOT NULL REFERENCES users(id),
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX milestone_feedback_message_thread ON milestone_feedback_messages(feedback_id, created_at);
    CREATE TABLE project_notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      recipient_id uuid NOT NULL REFERENCES users(id),
      action text NOT NULL,
      milestone_id uuid NOT NULL REFERENCES project_milestones(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX project_notification_recipient ON project_notifications(recipient_id, created_at DESC);
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE project_notifications, milestone_feedback_messages, milestone_feedback,
      milestone_submission_versions, milestone_draft_evidence, milestone_submissions;
    DROP FUNCTION preserve_milestone_submission();
  `);
}
