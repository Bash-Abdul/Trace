import type { PoolClient } from 'pg';
import type { Database } from '../../config/db.js';
import type { StructureItem } from '../projects/projects.types.js';

export async function plan(db: Database, projectId: string) {
  const links = await db.query<{ milestone_id: string; objective_id: string }>(
    'SELECT milestone_id, objective_id FROM milestone_objectives WHERE project_id = $1 ORDER BY objective_id',
    [projectId],
  );
  const requirements = await db.query<StructureItem & { milestone_id: string }>(
    `SELECT e.id, e.milestone_id, e.title, e.required FROM milestone_expected_evidence e
     JOIN project_milestones m ON m.id = e.milestone_id
     WHERE m.project_id = $1 ORDER BY e.position`,
    [projectId],
  );
  return { links: links.rows, requirements: requirements.rows };
}
export async function savePlan(db: PoolClient, projectId: string, milestones: StructureItem[]) {
  for (const milestone of milestones) {
    const links = milestone.objectiveIds ?? [];
    await db.query(
      'DELETE FROM milestone_objectives WHERE milestone_id = $1 AND NOT (objective_id = ANY($2::uuid[]))',
      [milestone.id, links],
    );
    await db.query(
      `INSERT INTO milestone_objectives (project_id, milestone_id, objective_id)
      SELECT $1, $2, unnest($3::uuid[]) ON CONFLICT DO NOTHING`,
      [projectId, milestone.id, links],
    );
    const requirements = milestone.expectedEvidence ?? [];
    await db.query(
      'DELETE FROM milestone_expected_evidence WHERE milestone_id = $1 AND NOT (id = ANY($2::uuid[]))',
      [milestone.id, requirements.map((r) => r.id)],
    );
    await db.query(
      `INSERT INTO milestone_expected_evidence (id, milestone_id, title, required, position)
      SELECT (item->>'id')::uuid, $1, item->>'title', (item->>'required')::boolean, (ordinality - 1)::integer
      FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS incoming(item, ordinality)
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, required = EXCLUDED.required, position = EXCLUDED.position
      WHERE milestone_expected_evidence.milestone_id = EXCLUDED.milestone_id`,
      [milestone.id, JSON.stringify(requirements)],
    );
  }
}
export async function saveMappings(
  db: PoolClient,
  milestoneId: string,
  items: { id: string; objectiveIds?: string[]; expectationIds?: string[] }[],
) {
  await db.query('DELETE FROM evidence_objectives WHERE milestone_id = $1', [milestoneId]);
  await db.query('DELETE FROM evidence_expectations WHERE milestone_id = $1', [milestoneId]);
  await db.query(
    `INSERT INTO evidence_objectives (milestone_id, evidence_id, objective_id)
    SELECT $1, (item->>'id')::uuid, objective::uuid
    FROM jsonb_array_elements($2::jsonb) item,
      jsonb_array_elements_text(COALESCE(item->'objectiveIds', '[]')) objective`,
    [milestoneId, JSON.stringify(items)],
  );
  await db.query(
    `INSERT INTO evidence_expectations (milestone_id, evidence_id, expectation_id)
    SELECT $1, (item->>'id')::uuid, expectation::uuid
    FROM jsonb_array_elements($2::jsonb) item,
      jsonb_array_elements_text(COALESCE(item->'expectationIds', '[]')) expectation`,
    [milestoneId, JSON.stringify(items)],
  );
}

export async function evidenceStates(db: Database, projectId: string) {
  const result = await db.query<{
    milestone_id: string;
    state: string;
    objective_id: string | null;
    expectation_id: string | null;
  }>(
    `WITH mappings AS (
       SELECT milestone_id, objective_id, NULL::uuid AS expectation_id FROM evidence_objectives
       UNION ALL
       SELECT milestone_id, NULL::uuid AS objective_id, expectation_id FROM evidence_expectations
     )
     SELECT m.id AS milestone_id, s.state, links.objective_id, links.expectation_id
     FROM project_milestones m
     JOIN milestone_submissions s ON s.milestone_id = m.id
     JOIN mappings links ON links.milestone_id = m.id
     WHERE m.project_id = $1 AND m.archived_at IS NULL`,
    [projectId],
  );
  return result.rows;
}

export async function snapshot(db: PoolClient, submissionId: string, plan: object) {
  await db.query(
    'INSERT INTO milestone_submission_coverage (submission_id, plan) VALUES ($1, $2::jsonb)',
    [submissionId, JSON.stringify(plan)],
  );
}
