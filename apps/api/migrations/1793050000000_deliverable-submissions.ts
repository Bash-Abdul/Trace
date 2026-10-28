import type { MigrationBuilder } from 'node-pg-migrate';
export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE deliverable_drafts (
      deliverable_id uuid PRIMARY KEY REFERENCES project_deliverables(id) ON DELETE CASCADE,
      version integer NOT NULL CHECK (version > 0),
      state text NOT NULL CHECK (state IN ('DRAFT', 'SUBMITTED')),
      kind text NOT NULL CHECK (kind IN ('TEXT', 'LINK')),
      content text NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 20000),
      note text NOT NULL CHECK (length(note) <= 2000),
      created_by uuid NOT NULL REFERENCES users(id),
      updated_by uuid NOT NULL REFERENCES users(id),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE deliverable_submission_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      deliverable_id uuid NOT NULL REFERENCES project_deliverables(id) ON DELETE CASCADE,
      number integer NOT NULL CHECK (number > 0),
      title text NOT NULL,
      required boolean NOT NULL,
      kind text NOT NULL CHECK (kind IN ('TEXT', 'LINK')),
      content text NOT NULL,
      note text NOT NULL,
      created_by uuid NOT NULL REFERENCES users(id),
      updated_by uuid NOT NULL REFERENCES users(id),
      submitted_by uuid NOT NULL REFERENCES users(id),
      submitted_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (deliverable_id, number)
    );
    CREATE FUNCTION preserve_deliverable_submission() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'Submitted deliverable versions are immutable' USING ERRCODE = '23514';
    END $$;
    CREATE TRIGGER preserve_deliverable_submission BEFORE UPDATE ON deliverable_submission_versions
      FOR EACH ROW EXECUTE FUNCTION preserve_deliverable_submission();
  `);
}
export function down(): void {
  throw new Error('Deliverable history must be retained. Use a forward migration.');
}
