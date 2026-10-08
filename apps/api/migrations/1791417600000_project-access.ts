import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      created_by_user_id uuid NOT NULL REFERENCES users(id),
      author_user_id uuid REFERENCES users(id),
      approval_route text NOT NULL CHECK (approval_route IN ('IN_PLATFORM_PROPOSAL', 'EXTERNALLY_APPROVED')),
      status text NOT NULL DEFAULT 'SETUP' CHECK (status = 'SETUP'),
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE project_memberships (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id),
      role text NOT NULL CHECK (role IN ('AUTHOR', 'MAIN_REVIEWER', 'DORMANT_REVIEWER')),
      joined_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (project_id, user_id)
    );
    CREATE UNIQUE INDEX project_one_author ON project_memberships(project_id) WHERE role = 'AUTHOR';
    CREATE UNIQUE INDEX project_one_main_reviewer ON project_memberships(project_id) WHERE role = 'MAIN_REVIEWER';
    CREATE INDEX project_membership_user ON project_memberships(user_id, project_id);
    CREATE TABLE project_invitations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email text NOT NULL CHECK (email = lower(btrim(email))),
      role text NOT NULL CHECK (role IN ('AUTHOR', 'MAIN_REVIEWER', 'DORMANT_REVIEWER')),
      token_hash varchar(64) NOT NULL UNIQUE CHECK (length(token_hash) = 64),
      invited_by_user_id uuid NOT NULL REFERENCES users(id),
      expires_at timestamptz NOT NULL,
      accepted_at timestamptz,
      accepted_by_user_id uuid REFERENCES users(id),
      cancelled_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((accepted_at IS NULL) = (accepted_by_user_id IS NULL)),
      CHECK (accepted_at IS NULL OR cancelled_at IS NULL)
    );
    CREATE UNIQUE INDEX project_pending_role ON project_invitations(project_id, role)
      WHERE role IN ('AUTHOR', 'MAIN_REVIEWER') AND accepted_at IS NULL AND cancelled_at IS NULL;
    CREATE UNIQUE INDEX project_pending_email ON project_invitations(project_id, email)
      WHERE accepted_at IS NULL AND cancelled_at IS NULL;
    CREATE TABLE project_audit_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      actor_user_id uuid NOT NULL REFERENCES users(id),
      event text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX project_audit_history ON project_audit_events(project_id, created_at, id);
    CREATE TABLE project_notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      recipient_user_id uuid NOT NULL REFERENCES users(id),
      audit_event_id uuid NOT NULL REFERENCES project_audit_events(id) ON DELETE CASCADE,
      event text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (audit_event_id, recipient_user_id)
    );
    CREATE TABLE project_idempotency (
      user_id uuid NOT NULL REFERENCES users(id),
      key_hash varchar(64) NOT NULL,
      request_hash varchar(64) NOT NULL,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, key_hash)
    );
    CREATE FUNCTION preserve_project_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.created_by_user_id <> OLD.created_by_user_id OR NEW.approval_route <> OLD.approval_route
        OR (OLD.author_user_id IS NOT NULL AND NEW.author_user_id IS DISTINCT FROM OLD.author_user_id)
      THEN RAISE EXCEPTION 'Project provenance and accepted authorship are immutable' USING ERRCODE = '23514'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER project_immutable_provenance BEFORE UPDATE ON projects
      FOR EACH ROW EXECUTE FUNCTION preserve_project_provenance();
    CREATE FUNCTION preserve_project_child_scope() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.project_id <> OLD.project_id THEN
        RAISE EXCEPTION 'Project records cannot move between projects' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER membership_immutable_scope BEFORE UPDATE ON project_memberships
      FOR EACH ROW EXECUTE FUNCTION preserve_project_child_scope();
    CREATE TRIGGER invitation_immutable_scope BEFORE UPDATE ON project_invitations
      FOR EACH ROW EXECUTE FUNCTION preserve_project_child_scope();
    CREATE FUNCTION check_project_author_slot() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE target uuid; author_id uuid; accepted_count integer; pending_count integer;
    BEGIN
      IF TG_TABLE_NAME = 'projects' THEN target := COALESCE(NEW.id, OLD.id);
      ELSE target := COALESCE(NEW.project_id, OLD.project_id); END IF;
      SELECT author_user_id INTO author_id FROM projects WHERE id = target;
      IF NOT FOUND THEN RETURN NULL; END IF;
      SELECT count(*) INTO accepted_count FROM project_memberships
        WHERE project_id = target AND role = 'AUTHOR';
      SELECT count(*) INTO pending_count FROM project_invitations
        WHERE project_id = target AND role = 'AUTHOR' AND accepted_at IS NULL AND cancelled_at IS NULL;
      IF (author_id IS NULL AND (accepted_count <> 0 OR pending_count <> 1))
        OR (author_id IS NOT NULL AND (accepted_count <> 1 OR pending_count <> 0 OR NOT EXISTS (
          SELECT 1 FROM project_memberships WHERE project_id = target AND user_id = author_id AND role = 'AUTHOR')))
      THEN RAISE EXCEPTION 'Project must retain exactly one author slot' USING ERRCODE = '23514'; END IF;
      RETURN NULL;
    END $$;
    CREATE CONSTRAINT TRIGGER project_author_slot AFTER INSERT OR UPDATE ON projects
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_project_author_slot();
    CREATE CONSTRAINT TRIGGER membership_author_slot AFTER INSERT OR UPDATE OR DELETE ON project_memberships
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_project_author_slot();
    CREATE CONSTRAINT TRIGGER invitation_author_slot AFTER INSERT OR UPDATE OR DELETE ON project_invitations
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_project_author_slot();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`DROP TABLE project_idempotency, project_notifications, project_audit_events,
    project_invitations, project_memberships, projects;
    DROP FUNCTION check_project_author_slot(); DROP FUNCTION preserve_project_provenance(); DROP FUNCTION preserve_project_child_scope();`);
}
