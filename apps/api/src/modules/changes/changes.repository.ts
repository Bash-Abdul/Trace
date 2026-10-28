import type { Database } from '../../config/db.js';
import type { PoolClient } from 'pg';
import type { ProposalSnapshot } from '../projects/projects.types.js';
import type { Change, ChangeState } from './changes.types.js';
export async function list(db: Database, projectId: string): Promise<Change[]> {
  return (
    await db.query<Change>(
      `SELECT * FROM project_changes WHERE project_id = $1 ORDER BY created_at DESC, id`,
      [projectId],
    )
  ).rows;
}
export async function find(db: Database, projectId: string, id: string): Promise<Change | null> {
  return (
    (
      await db.query<Change>('SELECT * FROM project_changes WHERE project_id = $1 AND id = $2', [
        projectId,
        id,
      ])
    ).rows[0] ?? null
  );
}
export async function hasOpen(db: Database, projectId: string): Promise<boolean> {
  return Boolean(
    (
      await db.query(
        "SELECT 1 FROM project_changes WHERE project_id = $1 AND state IN ('DRAFT','PROPOSED')",
        [projectId],
      )
    ).rowCount,
  );
}
export async function insert(
  db: PoolClient,
  projectId: string,
  userId: string,
  reason: string,
  before: ProposalSnapshot,
  after: ProposalSnapshot,
): Promise<Change> {
  const result = await db.query<Change>(
    `INSERT INTO project_changes
    (project_id, state, reason, before_structure, after_structure, created_by)
    VALUES ($1, 'DRAFT', $2, $3, $4, $5) RETURNING *`,
    [projectId, reason, JSON.stringify(before), JSON.stringify(after), userId],
  );
  return result.rows[0]!;
}
export async function edit(
  db: PoolClient,
  change: Change,
  reason: string,
  after: ProposalSnapshot,
): Promise<boolean> {
  return (
    (
      await db.query(
        `UPDATE project_changes SET reason = $3, after_structure = $4, version = version + 1, updated_at = now()
    WHERE id = $1 AND version = $2 AND state = 'DRAFT'`,
        [change.id, change.version, reason, JSON.stringify(after)],
      )
    ).rowCount === 1
  );
}
export async function transition(
  db: PoolClient,
  change: Change,
  state: ChangeState,
  userId: string,
  feedback: string | null = null,
): Promise<boolean> {
  return (
    (
      await db.query(
        `UPDATE project_changes SET state = $3, version = version + 1, updated_at = now(),
    submitted_by = CASE WHEN $3 = 'PROPOSED' THEN $4::uuid ELSE submitted_by END,
    submitted_at = CASE WHEN $3 = 'PROPOSED' THEN now() ELSE submitted_at END,
    decided_by = CASE WHEN $3 IN ('APPROVED_AND_APPLIED','REJECTED') THEN $4::uuid ELSE NULL END,
    decided_at = CASE WHEN $3 IN ('APPROVED_AND_APPLIED','REJECTED') THEN now() ELSE NULL END,
    feedback = $5
    WHERE id = $1 AND version = $2 AND state = $6`,
        [change.id, change.version, state, userId, feedback, change.state],
      )
    ).rowCount === 1
  );
}
// Archive rather than delete: submission/feedback foreign keys must survive removal.
export async function archiveRemoved(
  db: PoolClient,
  projectId: string,
  after: ProposalSnapshot,
): Promise<void> {
  for (const [table, items] of [
    ['project_milestones', after.milestones],
    ['project_deliverables', after.deliverables],
  ] as const) {
    await db.query(
      `UPDATE ${table} SET archived_at = now(), position = NULL
      WHERE project_id = $1 AND archived_at IS NULL AND NOT (id = ANY($2::uuid[]))`,
      [projectId, items.map((i) => i.id)],
    );
  }
}
export async function milestoneStates(db: PoolClient, projectId: string) {
  return (
    await db.query<{ id: string; state: string }>(
      `SELECT m.id, COALESCE(s.state, 'NOT_STARTED') AS state
    FROM project_milestones m LEFT JOIN milestone_submissions s ON s.milestone_id = m.id
    WHERE m.project_id = $1 AND m.archived_at IS NULL`,
      [projectId],
    )
  ).rows;
}
// Bump versions even for drafts so a stale editor cannot submit against changed expectations.
export async function reviseMilestones(db: PoolClient, ids: string[]): Promise<void> {
  await db.query(
    `UPDATE milestone_submissions
    SET state = CASE WHEN state = 'APPROVED' THEN 'REVISION_REQUESTED' ELSE state END,
      version = version + 1
    WHERE milestone_id = ANY($1::uuid[])`,
    [ids],
  );
}
