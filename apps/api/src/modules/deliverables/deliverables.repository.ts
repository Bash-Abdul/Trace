import type { PoolClient } from 'pg';
import type { Database } from '../../config/db.js';
import type { Params, Draft, DraftInput, Requirement, Submission } from './deliverables.types.js';
export async function requirement(db: Database, params: Params) {
  const result = await db.query<Requirement>(
    'SELECT id, title, required, archived_at FROM project_deliverables WHERE project_id = $1 AND id = $2',
    [params.projectId, params.deliverableId],
  );
  return result.rows[0] ?? null;
}
export async function draft(db: Database, id: string) {
  const result = await db.query<Draft>(
    'SELECT version, state, kind, content, note, created_by, updated_by, updated_at FROM deliverable_drafts WHERE deliverable_id = $1',
    [id],
  );
  return result.rows[0] ?? null;
}
export async function versions(db: Database, id: string) {
  const result = await db.query<Submission>(
    `SELECT id, number, title, required, kind, content, note, created_by, updated_by, submitted_by, submitted_at
    FROM deliverable_submission_versions WHERE deliverable_id = $1 ORDER BY number DESC`,
    [id],
  );
  return result.rows;
}
export async function save(
  db: PoolClient,
  id: string,
  userId: string,
  input: DraftInput,
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO deliverable_drafts (deliverable_id, version, state, kind, content, note, created_by, updated_by)
    VALUES ($1, 1, 'DRAFT', $2, $3, $4, $5, $5)
    ON CONFLICT (deliverable_id) DO UPDATE SET version = deliverable_drafts.version + 1,
      kind = EXCLUDED.kind, content = EXCLUDED.content, note = EXCLUDED.note,
      updated_by = EXCLUDED.updated_by, updated_at = now()
    WHERE deliverable_drafts.version = $6 AND deliverable_drafts.state = 'DRAFT'`,
    [id, input.kind, input.content, input.note, userId, input.version],
  );
  return result.rowCount === 1;
}
export async function transition(
  db: PoolClient,
  id: string,
  version: number,
  from: Draft['state'],
  to: Draft['state'],
): Promise<boolean> {
  const result = await db.query(
    `UPDATE deliverable_drafts SET state = $4, version = version + 1, updated_at = now()
    WHERE deliverable_id = $1 AND version = $2 AND state = $3`,
    [id, version, from, to],
  );
  return result.rowCount === 1;
}
export async function submit(
  db: PoolClient,
  requirement: Requirement,
  draft: Draft,
  userId: string,
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO deliverable_submission_versions
      (deliverable_id, number, title, required, kind, content, note, created_by, updated_by, submitted_by)
    SELECT $1, COALESCE(MAX(number), 0) + 1, $2, $3, $4, $5, $6, $7, $8, $9
    FROM deliverable_submission_versions WHERE deliverable_id = $1 RETURNING id`,
    [
      requirement.id,
      requirement.title,
      requirement.required,
      draft.kind,
      draft.content,
      draft.note,
      draft.created_by,
      draft.updated_by,
      userId,
    ],
  );
  if (!result.rows[0]) throw new Error('Deliverable submission insert returned no row');
  return result.rows[0].id;
}
// Plan changes retain submitted snapshots and make the current draft require resubmission.
export async function invalidate(db: PoolClient, ids: string[]): Promise<void> {
  await db.query(
    `UPDATE deliverable_drafts SET state = 'DRAFT', version = version + 1, updated_at = now()
    WHERE deliverable_id = ANY($1::uuid[])`,
    [ids],
  );
}
