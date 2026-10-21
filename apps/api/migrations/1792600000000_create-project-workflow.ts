import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_by_user_id uuid NOT NULL REFERENCES users(id),
      project_type text NOT NULL CHECK (project_type IN ('INDIVIDUAL', 'GROUP')),
      approval_route text NOT NULL CHECK (approval_route IN ('IN_PLATFORM_PROPOSAL', 'EXTERNALLY_APPROVED')),
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
      description text NOT NULL CHECK (length(description) BETWEEN 1 AND 2000),
      template_key text NOT NULL,
      template_version integer NOT NULL DEFAULT 1,
      status text NOT NULL DEFAULT 'SETUP' CHECK (status IN ('SETUP', 'PROPOSAL_IN_REVIEW', 'PROPOSAL_CHANGES_REQUESTED', 'PROPOSAL_REJECTED', 'ACTIVE')),
      version integer NOT NULL DEFAULT 1,
      activated_at timestamptz,
      activated_version integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE project_memberships (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id),
      role text NOT NULL CHECK (role IN ('LEAD_AUTHOR', 'AUTHOR', 'MAIN_REVIEWER', 'DORMANT_REVIEWER')),
      joined_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (project_id, user_id)
    );
    CREATE UNIQUE INDEX project_one_lead ON project_memberships(project_id) WHERE role = 'LEAD_AUTHOR';
    CREATE UNIQUE INDEX project_one_main_reviewer ON project_memberships(project_id) WHERE role = 'MAIN_REVIEWER';
    CREATE INDEX project_membership_user ON project_memberships(user_id);
    CREATE FUNCTION enforce_project_author_type() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE kind text;
    BEGIN
      SELECT project_type INTO kind FROM projects WHERE id = NEW.project_id FOR UPDATE;
      IF NEW.role = 'AUTHOR' AND kind <> 'GROUP' THEN
        RAISE EXCEPTION 'Additional authors require a group project' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER project_author_type BEFORE INSERT OR UPDATE ON project_memberships
      FOR EACH ROW EXECUTE FUNCTION enforce_project_author_type();
    CREATE TABLE project_objectives (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      position integer NOT NULL,
      title text NOT NULL,
      PRIMARY KEY (project_id, position)
    );
    CREATE TABLE project_milestones (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      position integer NOT NULL,
      title text NOT NULL,
      required boolean NOT NULL DEFAULT true,
      UNIQUE (project_id, position)
    );
    CREATE TABLE project_deliverables (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      position integer NOT NULL,
      title text NOT NULL,
      required boolean NOT NULL DEFAULT true,
      UNIQUE (project_id, position)
    );
    CREATE TABLE project_invitations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      invited_by_user_id uuid NOT NULL REFERENCES users(id),
      email text NOT NULL,
      role text NOT NULL CHECK (role IN ('LEAD_AUTHOR', 'AUTHOR', 'MAIN_REVIEWER')),
      token_hash varchar(64) NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
      consumed_at timestamptz,
      cancelled_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (NOT (consumed_at IS NOT NULL AND cancelled_at IS NOT NULL))
    );
    CREATE UNIQUE INDEX project_pending_invitee ON project_invitations(project_id, email)
      WHERE consumed_at IS NULL AND cancelled_at IS NULL;
    CREATE UNIQUE INDEX project_pending_single_role ON project_invitations(project_id, role)
      WHERE role IN ('LEAD_AUTHOR', 'MAIN_REVIEWER') AND consumed_at IS NULL AND cancelled_at IS NULL;
    CREATE TABLE project_proposals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      version integer NOT NULL,
      structure jsonb NOT NULL,
      submitted_by_user_id uuid NOT NULL REFERENCES users(id),
      submitted_at timestamptz NOT NULL DEFAULT now(),
      decision text CHECK (decision IN ('APPROVE', 'REQUEST_CHANGES', 'REJECT')),
      feedback text,
      decided_by_user_id uuid REFERENCES users(id),
      decided_at timestamptz,
      UNIQUE(project_id, version)
    );
    CREATE TABLE project_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      actor_user_id uuid NOT NULL REFERENCES users(id),
      action text NOT NULL,
      details jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX project_event_history ON project_events(project_id, created_at);
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP TABLE project_events, project_proposals, project_invitations, project_deliverables,
      project_milestones, project_objectives, project_memberships, projects;
    DROP FUNCTION enforce_project_author_type();
  `);
}
