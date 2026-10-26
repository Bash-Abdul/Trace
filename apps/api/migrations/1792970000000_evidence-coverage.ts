import type { MigrationBuilder } from 'node-pg-migrate';
export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE project_objectives ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE project_objectives DROP CONSTRAINT project_objectives_pkey,
      ADD PRIMARY KEY (id),
      ADD UNIQUE (project_id, id),
      ADD UNIQUE (project_id, position) DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE project_milestones ADD UNIQUE (project_id, id);
    CREATE TABLE milestone_objectives (
      project_id uuid NOT NULL,
      milestone_id uuid NOT NULL,
      objective_id uuid NOT NULL,
      PRIMARY KEY (milestone_id, objective_id),
      FOREIGN KEY (project_id, milestone_id) REFERENCES project_milestones(project_id, id) ON DELETE CASCADE,
      FOREIGN KEY (project_id, objective_id) REFERENCES project_objectives(project_id, id) ON DELETE CASCADE
    );
    CREATE TABLE milestone_expected_evidence (
      id uuid PRIMARY KEY,
      milestone_id uuid NOT NULL REFERENCES project_milestones(id) ON DELETE CASCADE,
      title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
      required boolean NOT NULL,
      position integer NOT NULL,
      UNIQUE (milestone_id, id),
      UNIQUE (milestone_id, position) DEFERRABLE INITIALLY DEFERRED
    );
    ALTER TABLE milestone_draft_evidence ADD UNIQUE (milestone_id, id);
    CREATE TABLE evidence_objectives (
      milestone_id uuid NOT NULL,
      evidence_id uuid NOT NULL,
      objective_id uuid NOT NULL,
      PRIMARY KEY (evidence_id, objective_id),
      FOREIGN KEY (milestone_id, evidence_id) REFERENCES milestone_draft_evidence(milestone_id, id) ON DELETE CASCADE,
      FOREIGN KEY (milestone_id, objective_id) REFERENCES milestone_objectives(milestone_id, objective_id) ON DELETE CASCADE
    );
    CREATE TABLE evidence_expectations (
      milestone_id uuid NOT NULL,
      evidence_id uuid NOT NULL,
      expectation_id uuid NOT NULL,
      PRIMARY KEY (evidence_id, expectation_id),
      FOREIGN KEY (milestone_id, evidence_id) REFERENCES milestone_draft_evidence(milestone_id, id) ON DELETE CASCADE,
      FOREIGN KEY (milestone_id, expectation_id) REFERENCES milestone_expected_evidence(milestone_id, id) ON DELETE CASCADE
    );
  `);
}
export function down(): void {
  throw new Error('Coverage identities must be retained; use a forward migration.');
}
