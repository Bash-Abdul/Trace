import type { MigrationBuilder } from 'node-pg-migrate';
export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE projects DROP CONSTRAINT projects_status_check;
    ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN
      ('SETUP','PROPOSAL_IN_REVIEW','PROPOSAL_CHANGES_REQUESTED','PROPOSAL_REJECTED','ACTIVE','FINAL_APPROVAL_PENDING','COMPLETED'));
    CREATE TABLE final_approval_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      number integer NOT NULL CHECK (number > 0),
      state text NOT NULL CHECK (state IN ('PENDING','APPROVED','REVISION_REQUESTED','INVALIDATED','WITHDRAWN')),
      base_version integer NOT NULL,
      snapshot jsonb NOT NULL,
      requested_by uuid NOT NULL REFERENCES users(id),
      requested_at timestamptz NOT NULL DEFAULT now(),
      request_key uuid NOT NULL,
      decision_key uuid,
      decided_by uuid REFERENCES users(id),
      decided_at timestamptz,
      feedback text,
      UNIQUE (project_id, number), UNIQUE (project_id, request_key), UNIQUE (project_id, decision_key),
      CHECK ((state = 'PENDING') = (decided_at IS NULL)),
      CHECK ((state = 'PENDING') = (decided_by IS NULL)),
      CHECK ((state IN ('APPROVED','REVISION_REQUESTED')) = (decision_key IS NOT NULL))
    );
    CREATE UNIQUE INDEX one_pending_final_request ON final_approval_requests(project_id) WHERE state = 'PENDING';
    CREATE FUNCTION preserve_final_request() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (NEW.id,NEW.project_id,NEW.number,NEW.base_version,NEW.snapshot,NEW.requested_by,NEW.requested_at,NEW.request_key)
        IS DISTINCT FROM (OLD.id,OLD.project_id,OLD.number,OLD.base_version,OLD.snapshot,OLD.requested_by,OLD.requested_at,OLD.request_key)
        OR (OLD.state <> 'PENDING' AND NEW IS DISTINCT FROM OLD) THEN
        RAISE EXCEPTION 'Final request snapshots and closed decisions are immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER preserve_final_request BEFORE UPDATE ON final_approval_requests
      FOR EACH ROW EXECUTE FUNCTION preserve_final_request();
    CREATE TABLE final_portfolio_snapshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      request_id uuid NOT NULL UNIQUE REFERENCES final_approval_requests(id) ON DELETE CASCADE,
      manifest jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE FUNCTION preserve_final_portfolio() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'Final portfolio snapshots are immutable' USING ERRCODE = '23514';
    END $$;
    CREATE TRIGGER preserve_final_portfolio BEFORE UPDATE ON final_portfolio_snapshots
      FOR EACH ROW EXECUTE FUNCTION preserve_final_portfolio();
  `);
}
export function down(): void {
  throw new Error('Completion records must be retained. Use a forward migration.');
}
